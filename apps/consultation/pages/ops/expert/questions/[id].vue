<script setup lang="ts">
// 質問ひとつの詳細と、コメントの記入。未決事項 2.19
//   下書きの保存／相談員の確認へ提出。提出後・公開後は、先生からは変更できない（確認した本文がそのまま公開されるため）。
//   差し戻された場合は、理由を見て本文を直し、再提出する。
import { apiErrorMessage, formatDateTime } from "../../../../ops/format";
type Detail = {
  questionId: string;
  displayId: string | null;
  genre: string | null;
  question: string;
  publishedAt: string | null;
  answer: string | null;
  comment: { commentId: string; body: string; status: "draft" | "pending" | "returned" | "published" | "hidden"; reviewNote: string | null; submittedAt: string | null; publishedAt: string | null; helpfulCount: number } | null;
};
const MAX = 5000;
const route = useRoute();
const id = computed(() => String(route.params.id));
const detail = ref<Detail | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const text = ref("");
const busy = ref(false);
const message = ref("");
const saveError = ref("");

const status = computed(() => detail.value?.comment?.status ?? null);
const editable = computed(() => status.value === null || status.value === "draft" || status.value === "returned");
const length = computed(() => Array.from(text.value).length);

async function load() {
  try {
    detail.value = await $fetch<Detail>(`/api/ops/expert/questions/${id.value}`);
    text.value = detail.value.comment?.body ?? "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function send(submit: boolean) {
  busy.value = true;
  saveError.value = "";
  message.value = "";
  try {
    await $fetch<unknown>(`/api/ops/expert/questions/${id.value}/comment`, { method: "PUT", body: { body: text.value, submit } });
    message.value = submit ? "提出しました。相談員が確認し、問題がなければ公開されます。" : "下書きを保存しました。";
    await load();
  } catch (e: any) {
    saveError.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
const STATUS_TEXT: Record<string, string> = {
  draft: "下書き（まだ提出されていません）",
  pending: "確認待ち（相談員が確認しています。この間は変更できません）",
  returned: "差し戻し（理由を確認して修正し、再提出してください）",
  published: "公開中",
  hidden: "非表示（運営の判断で、一時的に非表示になっています）",
};
onMounted(load);
</script>

<template>
  <div>
    <ExpertHeader />
    <main class="page">
      <p><NuxtLink to="/ops/expert">← 質問の一覧へ</NuxtLink></p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="detail">
        <article class="card">
          <p class="meta">
            <span v-if="detail.genre" class="tag">{{ detail.genre }}</span>
            <span>{{ formatDateTime(detail.publishedAt) }}</span>
            <span v-if="detail.displayId">投稿 {{ detail.displayId }}</span>
          </p>
          <h2 class="label">質問</h2>
          <p class="text">{{ detail.question }}</p>
          <h2 class="label">相談員からの回答</h2>
          <p v-if="detail.answer" class="text">{{ detail.answer }}</p>
          <p v-else class="note">相談員の回答はまだありません。</p>
        </article>

        <section class="card">
          <h2>先生のコメント</h2>
          <p v-if="status" class="status" :class="status">{{ STATUS_TEXT[status] }}</p>
          <p v-if="status === 'returned' && detail.comment?.reviewNote" class="return-note"><strong>差し戻しの理由：</strong>{{ detail.comment.reviewNote }}</p>
          <p v-if="message" class="ok" role="status">{{ message }}</p>

          <template v-if="editable">
            <label for="comment">コメント（{{ MAX }}文字まで）</label>
            <textarea id="comment" v-model="text" rows="12" :maxlength="MAX * 2" />
            <p class="note" :class="{ over: length > MAX }">{{ length }} / {{ MAX }} 文字</p>
            <p class="note">
              ・質問者や関係者が特定される内容は書かないでください。<br />
              ・一般的な考え方としてご記入ください。診断や、個別の事案への法的判断にあたる断定は避けてください。<br />
              ・提出後は先生からは変更できません。相談員が確認し、公開または差し戻します。
            </p>
            <div class="row">
              <button class="secondary" type="button" :disabled="busy || text.trim() === '' || length > MAX" @click="send(false)">{{ busy ? "保存中…" : "下書きを保存" }}</button>
              <button type="button" :disabled="busy || text.trim() === '' || length > MAX" @click="send(true)">{{ busy ? "提出中…" : "確認へ提出する" }}</button>
            </div>
            <p v-if="saveError" class="error" role="alert">{{ saveError }}</p>
          </template>
          <template v-else-if="detail.comment">
            <p class="text">{{ detail.comment.body }}</p>
            <p v-if="detail.comment.publishedAt" class="note">{{ formatDateTime(detail.comment.publishedAt) }} に公開されました。<template v-if="detail.comment.helpfulCount > 0">「参考になった」 {{ detail.comment.helpfulCount }} 人</template></p>
          </template>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 880px; margin: 24px auto; padding: 0 24px; }
.card { margin-bottom: 16px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--muted); }
.tag { padding: 1px 10px; background: #e9ece9; border-radius: 999px; }
.label { font-size: 13px; color: var(--accent); margin: 14px 0 4px; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
.status { padding: 6px 12px; border-radius: 6px; background: #eaeef2; }
.status.pending { background: #fff8c5; color: #7d4e00; }
.status.returned { background: #ffebe9; color: #cf222e; }
.status.published { background: #dafbe1; color: #1a7f37; }
.return-note { padding: 8px 12px; background: #fff; border-left: 4px solid #cf222e; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
textarea { width: 100%; padding: 10px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; }
.over { color: #cf222e; }
.row { display: flex; gap: 8px; }
button { width: auto; padding: 8px 16px; }
</style>
