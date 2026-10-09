<script setup lang="ts">
// 先生のコメントの確認（未決事項 2.19）。相談員・運営管理者。
// 確認待ち：内容を読み、公開または差し戻し（理由つき）。公開中・非表示：非表示／再公開（理由つき）。
// 【仮】公開前に相談員が確認する運用。先生が増えて負担が大きければ、先生ごとに確認なしの公開に切り替えることを検討する。
import { apiErrorMessage, formatDateTime } from "../../ops/format";
type Item = {
  commentId: string;
  body: string;
  status: string;
  reviewNote: string | null;
  submittedAt: string | null;
  reports: { count: number; reasons: Record<string, number> } | null;
  publishedAt: string | null;
  questionId: string;
  displayId: string | null;
  genre: string | null;
  question: string;
  expertName: string;
  expertQualification: string;
  expertAffiliation: string | null;
};
const TABS = [
  { key: "pending", label: "確認待ち" },
  { key: "returned", label: "差し戻し中" },
  { key: "reported", label: "通報あり" },
  { key: "published", label: "公開中" },
  { key: "hidden", label: "非表示" },
] as const;
const route = useRoute();
const initial = TABS.find((t) => t.key === route.query.status)?.key;
const tab = ref<(typeof TABS)[number]["key"]>(initial ?? "pending");
const items = ref<Item[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");
const busy = ref(false);
const active = ref<string | null>(null);   // 操作中のコメント
const mode = ref<"return" | "hide" | "restore" | "dismiss" | "close_reports" | null>(null);
const confirmed = reactive<Record<string, boolean>>({});
const text = ref("");

async function load() {
  loading.value = true;
  try {
    items.value = await $fetch<Item[]>("/api/ops/expert-comments", { query: { status: tab.value } });
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
function choose(key: typeof tab.value) {
  tab.value = key;
  active.value = null;
  mode.value = null;
  message.value = "";
  load();
}
function openMode(id: string, m: "return" | "hide" | "restore" | "dismiss" | "close_reports") {
  active.value = id;
  mode.value = m;
  text.value = "";
  errorMessage.value = "";
}
async function run(id: string, body: Record<string, unknown>, done: string) {
  busy.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>(`/api/ops/expert-comments/${id}`, { method: "PATCH", body });
    message.value = done;
    active.value = null;
    mode.value = null;
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
const publish = (id: string) => run(id, { action: "publish", confirmed: confirmed[id] === true }, "公開しました。");
const sendMode = (id: string) => {
  if (mode.value === "return") return run(id, { action: "return", note: text.value }, "差し戻しました。");
  if (mode.value === "hide") return run(id, { action: "hide", reason: text.value }, "非表示にしました。");
  if (mode.value === "dismiss") return run(id, { action: "dismiss", reason: text.value }, "通報を却下しました（コメントは公開のままです）。");
  if (mode.value === "close_reports") return run(id, { action: "close_reports", reason: text.value }, "通報を対応済みにしました（コメントは非表示のままです）。");
  return run(id, { action: "restore", reason: text.value }, "再び公開しました。");
};
const MODE_LABEL = { return: "差し戻す", hide: "非表示にする", restore: "再び公開する", dismiss: "通報を却下する", close_reports: "対応済みにする" } as const;
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <h1>先生のコメントの確認</h1>
      <p class="note">
        先生が書いたコメントを確認し、公開または差し戻します。個人が特定される内容、断定的な診断・個別の法的判断、他者への中傷などが含まれていないことを確認してください。
        確認した本文がそのまま公開されます（公開後は、先生も運営も本文を変更できません。問題があるときは非表示にしてください。書き直しの機能は未実装です）。
      </p>
      <div class="tabs" role="tablist">
        <button v-for="t in TABS" :key="t.key" type="button" :class="{ on: tab === t.key }" @click="choose(t.key)">{{ t.label }}</button>
      </div>
      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="items.length === 0" class="note">該当するコメントはありません。</p>

      <article v-for="c in items" :key="c.commentId" class="card">
        <p class="meta">
          <span v-if="c.genre" class="tag">{{ c.genre }}</span>
          <span v-if="c.displayId">投稿 {{ c.displayId }}</span>
          <span>提出 {{ formatDateTime(c.submittedAt) }}</span>
        </p>
        <h2 class="label">質問</h2>
        <p class="text clip">{{ c.question }}</p>
        <h2 class="label">{{ c.expertName }} 先生（{{ c.expertQualification }}<template v-if="c.expertAffiliation">／{{ c.expertAffiliation }}</template>）のコメント</h2>
        <p class="text">{{ c.body }}</p>
        <p v-if="c.reviewNote" class="note">差し戻しの理由：{{ c.reviewNote }}</p>
        <p v-if="c.reports" class="alert">
          未対応の通報 {{ c.reports.count }} 件（{{ Object.entries(c.reports.reasons).map(([k, v]) => `${k} ${v}`).join("、") }}）<span v-if="c.status === 'hidden'">／通報の集中により自動で非表示になっている場合があります</span>
        </p>

        <div v-if="tab === 'pending'" class="actions">
          <template v-if="active === c.commentId && mode === 'return'">
            <label>差し戻しの理由（先生に表示されます。1000文字以内）<textarea v-model="text" rows="3" maxlength="1000" /></label>
            <div class="row">
              <button class="secondary" type="button" @click="active = null">やめる</button>
              <button type="button" :disabled="busy || text.trim() === ''" @click="sendMode(c.commentId)">差し戻す</button>
            </div>
          </template>
          <template v-else>
            <label class="check"><input v-model="confirmed[c.commentId]" type="checkbox" />個人の特定、断定的な診断・個別の法的判断、中傷などが含まれていないことを確認した</label>
            <div class="row">
              <button type="button" :disabled="busy || !confirmed[c.commentId]" @click="publish(c.commentId)">公開する</button>
              <button class="secondary" type="button" @click="openMode(c.commentId, 'return')">差し戻す</button>
            </div>
          </template>
        </div>

        <div v-else-if="c.status === 'published' || c.status === 'hidden'" class="actions">
          <template v-if="active === c.commentId">
            <label>理由（必須。500文字以内）<input v-model="text" maxlength="500" /></label>
            <div class="row">
              <button class="secondary" type="button" @click="active = null">やめる</button>
              <button type="button" :disabled="busy || text.trim() === ''" @click="sendMode(c.commentId)">{{ MODE_LABEL[mode ?? "restore"] }}</button>
            </div>
          </template>
          <div v-else class="row">
            <template v-if="c.status === 'published'">
              <button class="secondary" type="button" @click="openMode(c.commentId, 'hide')">非表示にする</button>
              <button v-if="c.reports" class="secondary" type="button" @click="openMode(c.commentId, 'dismiss')">通報を却下する（公開のまま）</button>
            </template>
            <template v-else>
              <button class="secondary" type="button" @click="openMode(c.commentId, 'restore')">再び公開する</button>
              <button v-if="c.reports" class="secondary" type="button" @click="openMode(c.commentId, 'close_reports')">非表示のまま、通報を対応済みにする</button>
            </template>
          </div>
        </div>
      </article>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 880px; margin: 24px auto; padding: 0 24px; }
.tabs { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.tabs button { width: auto; padding: 6px 14px; font-size: 13px; background: #fff; color: var(--fg); border: 1px solid var(--line); }
.tabs button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.alert { padding: 8px 12px; background: #fff8c5; color: #7d4e00; border-radius: 6px; font-size: 14px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
.card { margin: 12px 0; padding: 16px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--muted); }
.tag { padding: 1px 10px; background: #e9ece9; border-radius: 999px; }
.label { font-size: 13px; color: var(--accent); margin: 12px 0 4px; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
.clip { max-height: 9em; overflow: auto; }
.actions { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.row { display: flex; gap: 8px; margin-top: 8px; }
label.check { display: flex; align-items: flex-start; gap: 6px; font-size: 14px; }
label.check input { width: auto; margin-top: 4px; }
textarea { width: 100%; padding: 8px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; }
button { width: auto; padding: 8px 16px; }
</style>
