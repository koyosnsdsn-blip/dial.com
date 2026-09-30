<script setup lang="ts">
// 質問の投稿（要件 2.5〜2.7）。月額会員のみ。
// - 投稿は、個人が分からない形に直したうえで公開される。投稿ごとに使い捨てのIDが付く
// - 入力の途中で、似た質問を提示する（投稿前に既存のQ&Aで解決できるように）
// - 上限に達したときは、個別のご相談への導線を表示する（2.5）
type Mine = {
  canPost: boolean;
  suspended: boolean;
  remaining: number;
  genres: { genreId: string; name: string }[];
  items: { questionId: string; body: string; canResubmit: boolean }[];
};
const route = useRoute();
const from = typeof route.query.from === "string" ? route.query.from : "";
const mine = ref<Mine | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const genreId = ref("");
const body = ref("");
const agreed = ref(false);
const busy = ref(false);
const sendError = ref("");
const similar = ref<{ questionId: string; question: string }[]>([]);

onMounted(async () => {
  try {
    mine.value = await $fetch<Mine>("/api/qa-posts");
    const original = from ? mine.value.items.find((i) => i.questionId === from && i.canResubmit) : null;
    if (original) body.value = original.body;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
});

let timer: ReturnType<typeof setTimeout> | null = null;
watch(body, (text) => {
  if (timer) clearTimeout(timer);
  if (text.trim().length < 10) {
    similar.value = [];
    return;
  }
  timer = setTimeout(async () => {
    try {
      similar.value = (await $fetch<{ items: { questionId: string; question: string }[] }>("/api/qa-similar", { method: "POST", body: { text } })).items;
    } catch {
      similar.value = [];
    }
  }, 800);
});

async function submit() {
  busy.value = true;
  sendError.value = "";
  try {
    await $fetch<unknown>("/api/qa-posts", { method: "POST", body: { genreId: genreId.value, body: body.value, resubmittedFrom: from || undefined } });
    await navigateTo("/mypage/questions?posted=1");
  } catch (e: any) {
    sendError.value = apiErrorMessage(e);
    busy.value = false;
  }
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="page">
      <p><NuxtLink to="/qa">← Q&amp;A の一覧へ</NuxtLink></p>
      <h1>質問を投稿する</h1>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="mine">
        <div v-if="!mine.canPost" class="card">
          <p>質問の投稿は、月額会員の方がご利用いただけます。</p>
        </div>
        <div v-else-if="mine.suspended" class="card">
          <p>現在、質問の投稿をご利用いただけません。お心当たりのない場合は、<NuxtLink to="/contact">運営への問い合わせ</NuxtLink>からご連絡ください。</p>
          <p class="note">Q&amp;A の閲覧と、個別のご相談は、これまでどおりご利用いただけます。</p>
        </div>
        <div v-else-if="mine.remaining <= 0" class="card stack">
          <p>今月の投稿は上限（3問）に達しました。</p>
          <p class="note">ご自身の状況についてのご相談は、相談員が個別にお受けしています。</p>
          <NuxtLink class="button" to="/consult">個別に相談する</NuxtLink>
        </div>
        <form v-else class="card" @submit.prevent="submit">
          <p class="notice">
            投稿は、相談員が内容を確認し、回答を付けて公開します（目安：3営業日以内）。<br />
            <strong>お名前・学校名・会社名・地名など、個人が分かる内容は書かないでください。</strong>書かれていた場合は、相談員が言い換えたうえで公開します。
          </p>
          <p v-if="from" class="note">前回の内容をもとに、書き直して投稿できます。</p>
          <label class="field" for="genre">ジャンル</label>
          <select id="genre" v-model="genreId" required>
            <option value="" disabled>選んでください</option>
            <option v-for="g in mine.genres" :key="g.genreId" :value="g.genreId">{{ g.name }}</option>
          </select>
          <label class="field" for="body">質問（2000文字まで）</label>
          <textarea id="body" v-model="body" rows="8" maxlength="2000" required></textarea>
          <div v-if="similar.length" class="similar">
            <p><strong>似た質問があります。</strong>すでに回答が載っているかもしれません。</p>
            <ul>
              <li v-for="s in similar" :key="s.questionId"><NuxtLink :to="`/qa/${s.questionId}`" target="_blank" rel="noopener">{{ s.question }}…</NuxtLink></li>
            </ul>
          </div>
          <label class="check"><input v-model="agreed" type="checkbox" />公開されること、1つの質問に1回の回答であること（やり取りは続かないこと）を確認しました</label>
          <p class="note">今月は、あと {{ mine.remaining }} 問投稿できます。緊急のときは、<NuxtLink to="/emergency">お急ぎのときの案内</NuxtLink>をご覧ください。</p>
          <p v-if="sendError" class="error" role="alert">{{ sendError }}</p>
          <button type="submit" :disabled="busy || !agreed || genreId === '' || body.trim().length === 0">{{ busy ? "投稿しています…" : "投稿する" }}</button>
        </form>
      </template>
      <EmergencyLink />
    </main>
  </div>
</template>

<style scoped>
select { width: 100%; padding: 12px; font: inherit; border: 1px solid #aab3b1; border-radius: 8px; background: #fff; }
.similar { margin-top: 12px; padding: 12px 14px; background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: 8px; font-size: 0.9rem; }
.similar ul { margin: 0; padding-left: 1.2em; }
.check { display: flex; align-items: flex-start; gap: 8px; margin: 14px 0; font-size: 0.9rem; }
.check input { width: auto; margin-top: 6px; }
</style>
