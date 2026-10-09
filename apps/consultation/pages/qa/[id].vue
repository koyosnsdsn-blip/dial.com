<script setup lang="ts">
// Q&A の記事（要件 2.4・2.6・2.8・2.9）
// - 投稿者は使い捨ての表示IDだけを表示する。回答者の氏名は表示しない（3.6.1）
// - 回答の全文を読めない場合、サーバーは冒頭30文字しか返さない。続きの導線を表示する
// - 回答の末尾に、個別のご相談（機能2）への導線を常設する（2.9）
// - 通報は、受け付けた旨だけを表示する（結果はお知らせしない：7.11.3）
type Detail = {
  questionId: string;
  displayId: string | null;
  operatorCreated: boolean;
  genre: string | null;
  question: string;
  publishedAt: string | null;
  answer: string;
  answerMasked: boolean;
  answerUpdatedAt: string | null;
  expertComments: {
    commentId: string;
    body: string;
    masked: boolean;
    publishedAt: string | null;
    expertName: string;
    expertQualification: string;
    expertAffiliation: string | null;
    expertBio: string | null;
  }[];
  signedIn: boolean;
  remainingReads: number | null;
  reported: boolean;
  own: boolean;
  features: { qa: boolean; qaFull: boolean; qaPost: boolean; video: boolean };
};
const REPORT_REASONS = [
  { code: "identifiable", label: "個人が特定されそうな内容がある" },
  { code: "inappropriate", label: "不適切な内容がある" },
  { code: "incorrect", label: "誤った情報がある" },
  { code: "other", label: "その他" },
];

const route = useRoute();
const id = computed(() => String(route.params.id));
const detail = ref<Detail | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const unlocking = ref(false);
const unlockError = ref("");
const reportOpen = ref(false);
const reportCode = ref("");
const reportBusy = ref(false);
const reportMessage = ref("");

async function load() {
  try {
    detail.value = await $fetch<Detail>(`/api/qa/${id.value}`);
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function unlock() {
  unlocking.value = true;
  unlockError.value = "";
  try {
    await $fetch<unknown>(`/api/qa/${id.value}/unlock`, { method: "POST" });
    await load();
  } catch (e: any) {
    unlockError.value = apiErrorMessage(e);
  } finally {
    unlocking.value = false;
  }
}
async function report() {
  reportBusy.value = true;
  try {
    await $fetch<unknown>(`/api/qa/${id.value}/report`, { method: "POST", body: { code: reportCode.value } });
    reportMessage.value = "通報を受け付けました。運営が内容を確認します。";
    reportOpen.value = false;
    if (detail.value) detail.value.reported = true;
  } catch (e: any) {
    reportMessage.value = apiErrorMessage(e);
  } finally {
    reportBusy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div>
    <AppHeader />
    <main class="page">
      <p><NuxtLink to="/qa">← Q&amp;A の一覧へ</NuxtLink></p>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="detail">
        <article class="card">
          <p class="meta">
            <span v-if="detail.genre" class="tag">{{ detail.genre }}</span>
            <span>{{ formatShortDate(detail.publishedAt) }}</span>
            <span v-if="detail.operatorCreated">運営が作成した記事</span>
            <span v-else-if="detail.displayId">投稿 {{ detail.displayId }}</span>
          </p>
          <h1 class="label">質問</h1>
          <p class="text">{{ detail.question }}</p>
          <h2 class="label">相談員からの回答</h2>
          <p class="text">{{ detail.answer }}<template v-if="detail.answerMasked">…</template></p>

          <div v-if="detail.answerMasked" class="notice gate">
            <template v-if="!detail.signedIn">
              <p><strong>続きを読むには、会員登録が必要です。</strong></p>
              <NuxtLink class="button" to="/">登録・ログインする</NuxtLink>
            </template>
            <template v-else-if="(detail.remainingReads ?? 0) > 0">
              <p><strong>今月は、あと {{ detail.remainingReads }} 本まで全文を読めます。</strong></p>
              <button type="button" :disabled="unlocking" @click="unlock">{{ unlocking ? "開いています…" : "この回答の全文を読む" }}</button>
              <p v-if="unlockError" class="error" role="alert">{{ unlockError }}</p>
            </template>
            <template v-else>
              <p><strong>今月、全文を読める本数（3本）を使い切りました。</strong></p>
              <p class="note">ご自身の状況についてのご相談は、相談員が個別にお受けしています。</p>
              <NuxtLink class="button" to="/consult">個別に相談する</NuxtLink>
            </template>
          </div>
          <p v-if="detail.answerUpdatedAt" class="note">回答は {{ formatShortDate(detail.answerUpdatedAt) }} に追記・修正されました。</p>
        </article>

        <section v-if="detail.expertComments.length > 0" class="card stack">
          <h2>先生からのコメント</h2>
          <p class="note">専門家の先生が、一般的な考え方としてお寄せくださったコメントです。個別のご事情への判断ではありません。</p>
          <div v-for="c in detail.expertComments" :key="c.commentId" class="expert">
            <p class="who">
              <strong>{{ c.expertName }} 先生</strong>
              <span>{{ c.expertQualification }}<template v-if="c.expertAffiliation">／{{ c.expertAffiliation }}</template></span>
            </p>
            <p v-if="c.expertBio" class="note">{{ c.expertBio }}</p>
            <p class="text">{{ c.body }}<template v-if="c.masked">…</template></p>
            <p v-if="c.publishedAt" class="note">{{ formatShortDate(c.publishedAt) }}</p>
          </div>
          <p v-if="detail.expertComments.some((c) => c.masked)" class="note">続きは、上の回答の全文を開くとお読みいただけます。</p>
        </section>

        <section class="card stack">
          <h2>ご自身の場合について相談したいとき</h2>
          <p class="note">ここでの回答は、一般的な考え方をお伝えするものです。個別のご事情によって、対応は変わります。</p>
          <NuxtLink class="button secondary" :to="detail.signedIn ? '/consult' : '/'">相談員に個別に相談する</NuxtLink>
        </section>

        <section v-if="detail.signedIn" class="report">
          <p v-if="reportMessage" class="note" role="status">{{ reportMessage }}</p>
          <p v-else-if="detail.reported" class="note">この記事は、通報を受け付けています。</p>
          <button v-else-if="!reportOpen" type="button" class="plain" @click="reportOpen = true">この記事の問題を報告する</button>
          <div v-if="reportOpen" class="card stack">
            <h2>この記事の問題を報告する</h2>
            <label v-for="r in REPORT_REASONS" :key="r.code" class="radio"><input v-model="reportCode" type="radio" name="reason" :value="r.code" />{{ r.label }}</label>
            <p class="note">報告の結果は、個別にはお知らせしていません。</p>
            <button type="button" :disabled="reportBusy || reportCode === ''" @click="report">報告する</button>
            <button type="button" class="secondary" :disabled="reportBusy" @click="reportOpen = false">やめる</button>
          </div>
        </section>
      </template>
      <EmergencyLink />
    </main>
  </div>
</template>

<style scoped>
.meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.8rem; color: var(--muted); }
.tag { padding: 1px 10px; background: #e9ece9; border-radius: 999px; }
.label { font-size: 0.85rem; color: var(--accent); margin: 14px 0 4px; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
.gate { margin-top: 12px; }
.gate p { margin-bottom: 8px; }
.expert { padding: 10px 0; border-top: 1px solid var(--line); }
.expert .who { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.expert .who span { font-size: 0.85rem; color: var(--muted); }
.report { margin: 8px 0 16px; text-align: center; }
.report .card { text-align: left; }
.radio { display: flex; align-items: center; gap: 8px; }
.radio input { width: auto; }
</style>
