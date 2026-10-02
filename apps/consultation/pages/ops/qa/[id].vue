<script setup lang="ts">
// Q&A の回答・公開画面（要件 7.4・6章）
// - 個人が特定され得る記述は、投稿者に直させず、相談員が言い換えて公開する（6.4.2）。直す前後は差分として残る
// - 回答は一般的な考え方の範囲にとどめ、個別の事情には踏み込まない（機能2へ案内する：2.9）
// - 却下（B/E/F）・破棄（G1〜G4）・既存Q&Aへのマージ
// - 投稿者の過去の投稿は見せない。必要なときは、運営管理者が理由を入力して開示する（2.6）
import { apiErrorMessage, formatDateTime } from "../../../ops/format";
import { useStaff } from "../../../ops/useStaff";
type Detail = {
  questionId: string;
  displayId: string | null;
  status: string;
  genre: string | null;
  body: string;
  postedAt: string;
  businessDays: number;
  recentPosts: number;
  returnExhausted: boolean;
  discardCount: number;
  discardsUntilSuspend: number;
  original: { body: string; reasonCode: string | null; reasonText: string | null } | null;
  similar: { questionId: string; excerpt: string }[];
  rejectCodes: Record<string, string>;
  discardCodes: Record<string, string>;
};
type Template = { templateId: string; title: string; body: string };
const REFERRAL = "一般的な考え方は以上のとおりですが、個別のご事情によって対応は変わります。ご自身の場合について詳しくご相談になりたいときは、「ご相談」から、相談員が個別にお受けします。";

const staff = useStaff();
const route = useRoute();
const id = computed(() => String(route.params.id));
const detail = ref<Detail | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const actionError = ref("");
const busy = ref(false);
const edited = ref("");
const answer = ref("");
const checks = reactive({ names: false, dates: false, meaning: false });
const mode = ref<"" | "reject" | "discard" | "merge">("");
const form = reactive({ code: "", text: "", into: "" });
const templates = ref<Template[]>([]);
const history = ref<{ questionId: string; displayId: string | null; body: string; status: string; postedAt: string }[] | null>(null);
const historyReason = ref("");

async function load() {
  try {
    detail.value = await $fetch<Detail>(`/api/ops/qa-queue/${id.value}`);
    edited.value = detail.value.body;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(async () => {
  await load();
  try {
    templates.value = await $fetch<Template[]>("/api/ops/reply-templates");
  } catch {
    templates.value = [];
  }
});
const bodyChanged = computed(() => Boolean(detail.value) && edited.value.trim() !== detail.value!.body);
const allChecked = computed(() => checks.names && checks.dates && checks.meaning);
const pending = computed(() => detail.value?.status === "pending");

async function act(fn: () => Promise<unknown>) {
  busy.value = true;
  actionError.value = "";
  try {
    await fn();
    await navigateTo("/ops/qa");
  } catch (e: any) {
    actionError.value = apiErrorMessage(e);
    busy.value = false;
  }
}
function publish() {
  if (!window.confirm("回答を付けて公開します。よろしいですか？")) return;
  return act(() => $fetch<unknown>(`/api/ops/qa-queue/${id.value}/publish`, { method: "POST", body: { answer: answer.value, body: bodyChanged.value ? edited.value : undefined, checked: allChecked.value } }));
}
function submitAction() {
  if (mode.value === "reject") return act(() => $fetch<unknown>(`/api/ops/qa-queue/${id.value}/reject`, { method: "POST", body: { code: form.code, text: form.text } }));
  if (mode.value === "discard") return act(() => $fetch<unknown>(`/api/ops/qa-queue/${id.value}/discard`, { method: "POST", body: { code: form.code, text: form.text } }));
  if (mode.value === "merge") return act(() => $fetch<unknown>(`/api/ops/qa-queue/${id.value}/merge`, { method: "POST", body: { into: form.into } }));
}
function setMode(m: "" | "reject" | "discard" | "merge") {
  mode.value = m;
  Object.assign(form, { code: "", text: "", into: "" });
}
function insert(text: string) {
  answer.value = answer.value ? `${answer.value}\n\n${text}` : text;
}
function insertTemplate(event: Event) {
  const sel = event.target as HTMLSelectElement;
  const t = templates.value.find((x) => x.templateId === sel.value);
  if (t) insert(t.body);
  sel.value = "";
}
async function disclose() {
  actionError.value = "";
  try {
    history.value = (await $fetch<{ items: NonNullable<typeof history.value> }>(`/api/ops/qa-queue/${id.value}/history`, { method: "POST", body: { reason: historyReason.value } })).items;
  } catch (e: any) {
    actionError.value = apiErrorMessage(e);
  }
}
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm">
      <p><NuxtLink to="/ops/qa">← 回答待ちの一覧へ</NuxtLink></p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="detail">
        <h1>投稿への対応　<span class="muted">{{ detail.displayId }}</span></h1>
        <p class="note">
          {{ formatDateTime(detail.postedAt) }} 投稿（{{ detail.businessDays }} 営業日経過）／ジャンル：{{ detail.genre ?? "—" }}
          <span v-if="detail.recentPosts >= 2" class="badge wait">同じ投稿者から直近30日で {{ detail.recentPosts }} 件目</span>
        </p>
        <p v-if="!pending" class="warn">この投稿は、すでに処理されています。</p>
        <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

        <section v-if="detail.original" class="panel">
          <h2>書き直しての再投稿です</h2>
          <p class="note">前回の却下：{{ detail.original.reasonCode }} {{ detail.original.reasonText }}</p>
          <p class="pre muted">{{ detail.original.body }}</p>
        </section>

        <section class="panel">
          <h2>投稿の内容</h2>
          <p class="note">個人が特定され得る記述は、ここで言い換えてください（固有名詞の一般化・削除、日時や年齢の丸めに限ります。質問の趣旨と事実関係は変えないでください）。直した場合、投稿者には「一部を言い換えて公開した」ことが伝わります。</p>
          <textarea v-model="edited" rows="8" maxlength="2000" :disabled="!pending" aria-label="投稿の本文" />
          <template v-if="bodyChanged">
            <h3>変更前</h3>
            <p class="pre muted">{{ detail.body }}</p>
            <button class="secondary small" type="button" @click="edited = detail.body">変更を取り消す</button>
          </template>
          <h3>匿名化の確認</h3>
          <label class="check"><input v-model="checks.names" type="checkbox" :disabled="!pending" />氏名・学校名・会社名・施設名・地名などの固有名詞が残っていない</label>
          <label class="check"><input v-model="checks.dates" type="checkbox" :disabled="!pending" />日時・年齢・人数などが、特定につながる細かさで書かれていない</label>
          <label class="check"><input v-model="checks.meaning" type="checkbox" :disabled="!pending" />質問の趣旨と事実関係を変えていない</label>
        </section>

        <section v-if="detail.similar.length" class="panel">
          <h2>似ている既存の Q&amp;A</h2>
          <ul>
            <li v-for="s in detail.similar" :key="s.questionId">
              <NuxtLink :to="`/ops/articles/${s.questionId}`" target="_blank">{{ s.excerpt }}…</NuxtLink>
              <button v-if="pending" class="secondary small" type="button" @click="setMode('merge'); form.into = s.questionId">この記事へマージ</button>
            </li>
          </ul>
        </section>

        <section v-if="pending" class="panel">
          <h2>回答</h2>
          <p class="note">一般的な考え方・対処の方向性の範囲でお答えください。個別の事情に踏み込む内容は、相談（機能2）へご案内します。本文中で氏名を名乗らないでください。</p>
          <div class="row">
            <select v-if="templates.length" style="width: auto" aria-label="テンプレートを挿入" @change="insertTemplate">
              <option value="">テンプレートを挿入…</option>
              <option v-for="t in templates" :key="t.templateId" :value="t.templateId">{{ t.title }}</option>
            </select>
            <button class="secondary small" type="button" @click="insert(REFERRAL)">相談への案内文を挿入</button>
          </div>
          <textarea v-model="answer" rows="10" maxlength="5000" aria-label="回答" />
          <div class="row">
            <button type="button" :disabled="busy || answer.trim() === '' || !allChecked" @click="publish">回答を公開する</button>
            <button class="secondary" type="button" :disabled="busy" @click="setMode('reject')">却下…</button>
            <button class="secondary" type="button" :disabled="busy" @click="setMode('discard')">破棄…</button>
            <button class="secondary" type="button" :disabled="busy" @click="setMode('merge')">既存の Q&amp;A へマージ…</button>
          </div>
          <p v-if="!allChecked" class="note">公開するには、匿名化の確認の3項目にチェックを入れてください。</p>
        </section>

        <section v-if="pending && mode === 'reject'" class="panel">
          <h2>却下する</h2>
          <p v-if="detail.returnExhausted" class="warn">この投稿者は、今月の投稿枠の返却が上限（2回）に達しています。却下しても、投稿枠は戻りません。</p>
          <label v-for="(label, code) in detail.rejectCodes" :key="code" class="check"><input v-model="form.code" type="radio" name="code" :value="code" />{{ code }}：{{ label }}</label>
          <p v-if="form.code === 'F'" class="note">投稿者の画面には、相談（機能2）と公的窓口への案内が自動で表示されます。危険の兆候がある場合は、運営管理者へすぐに共有してください。</p>
          <label for="rj-text">投稿者に伝える補足（任意）</label>
          <textarea id="rj-text" v-model="form.text" rows="3" maxlength="1000" />
          <div class="row">
            <button type="button" :disabled="busy || form.code === ''" @click="submitAction">却下する</button>
            <button class="secondary" type="button" @click="setMode('')">やめる</button>
          </div>
        </section>

        <section v-if="pending && mode === 'discard'" class="panel">
          <h2>破棄する</h2>
          <p class="warn">
            破棄は、投稿枠を返さない処理です。<strong>文章の上手・下手ではなく、相談する意図が認められるかどうか</strong>で判断してください。
            要領を得ない・短い・感情的・誤字が多い、といった投稿は破棄ではなく、却下（E）として書き直しを案内します。
          </p>
          <p class="note">この投稿者の破棄は、これまでに {{ detail.discardCount }} 回です。あと {{ detail.discardsUntilSuspend }} 回で、投稿機能が自動で止まります（閲覧と相談は止まりません）。</p>
          <label v-for="(label, code) in detail.discardCodes" :key="code" class="check"><input v-model="form.code" type="radio" name="code" :value="code" />{{ code }}：{{ label }}</label>
          <label for="dc-text">理由の記録（必須。投稿者には表示されません）</label>
          <textarea id="dc-text" v-model="form.text" rows="3" maxlength="1000" />
          <div class="row">
            <button class="danger" type="button" :disabled="busy || form.code === '' || form.text.trim() === ''" @click="submitAction">破棄する</button>
            <button class="secondary" type="button" @click="setMode('')">やめる</button>
          </div>
        </section>

        <section v-if="pending && mode === 'merge'" class="panel">
          <h2>既存の Q&amp;A へマージする</h2>
          <p class="note">投稿者には、統合先の Q&amp;A を案内します。投稿枠は返します。統合先に補足が必要な場合は、公開済みの記事の画面で回答に追記してください。</p>
          <label for="mg-into">統合先の記事のID</label>
          <input id="mg-into" v-model="form.into" placeholder="上の「似ている既存の Q&A」から選ぶか、記事のIDを貼り付け" />
          <div class="row">
            <button type="button" :disabled="busy || form.into.trim() === ''" @click="submitAction">マージする</button>
            <button class="secondary" type="button" @click="setMode('')">やめる</button>
          </div>
        </section>

        <section v-if="staff?.role === 'admin' && detail.recentPosts >= 2" class="panel">
          <h2>投稿履歴の例外開示</h2>
          <p class="note">通常の対応では、投稿者の過去の投稿は表示しません。内容が短期間に切迫しているなど、必要があるときに限り、理由を記録して開示します（監査ログに残ります）。</p>
          <template v-if="history === null">
            <label for="hist-reason">開示の理由（必須）</label>
            <input id="hist-reason" v-model="historyReason" maxlength="500" />
            <button class="secondary" type="button" :disabled="historyReason.trim() === ''" @click="disclose">過去の投稿を開示する</button>
          </template>
          <template v-else>
            <p v-if="history.length === 0" class="note">ほかの投稿はありません。</p>
            <div v-for="h in history" :key="h.questionId" class="past">
              <p class="note">{{ formatDateTime(h.postedAt) }}／{{ h.displayId }}／{{ h.status }}</p>
              <p class="pre">{{ h.body }}</p>
            </div>
          </template>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
ul { margin: 0; padding-left: 1.2em; font-size: 14px; }
li { margin: 6px 0; }
li button { margin-left: 8px; }
.past { padding: 8px 0; border-top: 1px solid var(--line); }
</style>
