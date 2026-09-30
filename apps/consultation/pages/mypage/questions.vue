<script setup lang="ts">
// 自分の投稿（要件 2.6・6.4.7）。処理の結果と理由を確認できる。削除もここから行う（9.3）
// - 公開済みの投稿を削除すると、投稿と自分との紐付けだけが消え、Q&A の本体は残る（特則）。操作の前に明示する
type Item = {
  questionId: string;
  displayId: string | null;
  genre: string | null;
  body: string;
  status: "pending" | "published" | "rejected" | "discarded" | "merged";
  unpublished: boolean;
  postedAt: string;
  publishedAt: string | null;
  answer: string | null;
  anonymized: boolean;
  mergedInto: string | null;
  reasonText: string | null;
  quotaReturned: boolean;
  canResubmit: boolean;
  needsConsultGuide: boolean;
};
type Mine = { canPost: boolean; suspended: boolean; remaining: number; items: Item[] };
const STATUS: Record<Item["status"], string> = { pending: "確認中", published: "公開中", rejected: "公開されませんでした", discarded: "公開されませんでした", merged: "すでにある Q&A をご案内" };

const route = useRoute();
const mine = ref<Mine | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const confirmId = ref("");
const busy = ref(false);
const actionError = ref("");

async function load() {
  try {
    mine.value = await $fetch<Mine>("/api/qa-posts");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function remove(it: Item) {
  busy.value = true;
  actionError.value = "";
  try {
    await $fetch<unknown>(`/api/qa-posts/${it.questionId}`, { method: "DELETE" });
    confirmId.value = "";
    await load();
  } catch (e: any) {
    actionError.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div>
    <AppHeader />
    <main class="page">
      <p><NuxtLink to="/mypage">← マイページへ</NuxtLink></p>
      <h1>自分の投稿</h1>
      <p v-if="route.query.posted" class="notice" role="status">投稿を受け付けました。相談員が確認し、回答を付けて公開します（目安：3営業日以内）。結果は、この画面でご確認いただけます。</p>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="mine">
        <p v-if="mine.suspended" class="notice warn">現在、質問の投稿をご利用いただけません。お心当たりのない場合は、<NuxtLink to="/contact">運営への問い合わせ</NuxtLink>からご連絡ください。</p>
        <p v-else-if="mine.canPost" class="note">今月は、あと {{ mine.remaining }} 問投稿できます。<NuxtLink to="/qa/post">質問を投稿する</NuxtLink></p>
        <p v-if="mine.items.length === 0" class="card note">まだ投稿はありません。</p>
        <article v-for="it in mine.items" :key="it.questionId" class="card">
          <p class="meta">
            <span class="state" :class="it.status">{{ it.unpublished ? "公開を停止中" : STATUS[it.status] }}</span>
            <span v-if="it.genre">{{ it.genre }}</span>
            <span>{{ formatShortDate(it.postedAt) }} 投稿</span>
            <span v-if="it.displayId">{{ it.displayId }}</span>
          </p>
          <p class="text">{{ it.body }}</p>
          <p v-if="it.status === 'published' && it.anonymized" class="note">個人が分からないよう、相談員が一部を言い換えて公開しています。上の文面が、公開されている内容です。内容に問題がある場合は、<NuxtLink to="/contact">運営への問い合わせ</NuxtLink>からお知らせください。公開を取り下げます。</p>
          <template v-if="it.status === 'published' && it.answer">
            <h2 class="label">相談員からの回答</h2>
            <p class="text">{{ it.answer }}</p>
            <p><NuxtLink :to="`/qa/${it.questionId}`">公開されているページを見る</NuxtLink></p>
          </template>
          <template v-if="it.status === 'merged' && it.mergedInto">
            <p class="note">同じ内容の Q&amp;A がすでにありましたので、そちらをご案内します。今回の投稿は、投稿数に数えていません。</p>
            <p><NuxtLink :to="`/qa/${it.mergedInto}`">ご案内する Q&amp;A を見る</NuxtLink></p>
          </template>
          <template v-if="it.reasonText">
            <p class="reason">{{ it.reasonText }}</p>
            <p v-if="it.status === 'rejected'" class="note">{{ it.quotaReturned ? "今回の投稿は、投稿数に数えていません。" : "今月は、投稿数の返却の上限に達しているため、この投稿は投稿数に数えられています。" }}</p>
            <div v-if="it.needsConsultGuide" class="stack guide">
              <NuxtLink class="button" to="/consult">相談員に個別に相談する</NuxtLink>
              <NuxtLink class="button secondary" to="/emergency">お急ぎのときの案内を見る</NuxtLink>
            </div>
            <NuxtLink v-if="it.canResubmit" class="button secondary" :to="`/qa/post?from=${it.questionId}`">書き直して投稿する</NuxtLink>
          </template>

          <div class="delete">
            <button v-if="confirmId !== it.questionId" type="button" class="plain" @click="confirmId = it.questionId">この投稿を削除する</button>
            <div v-else class="stack">
              <p v-if="it.status === 'published'"><strong>この投稿と、あなたとの紐付けを削除します。元に戻せません。</strong><br />公開されている Q&amp;A の本体は、他の方の参考のために残ります。本体の削除をご希望の場合は、<NuxtLink to="/contact">運営への問い合わせ</NuxtLink>からお申し出ください。</p>
              <p v-else><strong>この投稿を削除します。削除すると、元に戻せません。</strong></p>
              <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
              <button type="button" class="danger" :disabled="busy" @click="remove(it)">削除する</button>
              <button type="button" class="secondary" :disabled="busy" @click="confirmId = ''">やめる</button>
            </div>
          </div>
        </article>
      </template>
    </main>
  </div>
</template>

<style scoped>
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--muted); }
.state { padding: 1px 10px; border-radius: 999px; background: #e9ece9; color: var(--fg); }
.state.published { background: var(--accent); color: #fff; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
.label { font-size: 0.85rem; color: var(--accent); margin: 14px 0 4px; }
.reason { white-space: pre-wrap; padding: 10px 12px; background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: 8px; font-size: 0.9rem; }
.guide { margin-bottom: 12px; }
.delete { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--line); }
button.danger { background: var(--danger); border-color: var(--danger); }
</style>
