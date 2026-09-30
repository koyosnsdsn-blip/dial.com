<script setup lang="ts">
// Q&A の一覧・検索（要件 2.3・2.4）。ログインしていなくても見られる。
// 回答は冒頭だけを表示する。全文は記事の画面で、会員区分に応じて表示する（切り詰めはサーバー側）。
// 企業会員向けの構成：投稿の導線・会員区分の表示は出さない（8.6.1.1）
type Item = {
  questionId: string;
  displayId: string | null;
  operatorCreated: boolean;
  genre: string | null;
  question: string;
  questionCut: boolean;
  answerPreview: string;
  publishedAt: string | null;
  featured: boolean;
};
type List = {
  genres: { genreId: string; name: string }[];
  items: Item[];
  total: number;
  page: number;
  size: number;
  features: { qa: boolean; qaFull: boolean; qaPost: boolean; video: boolean };
};

const route = useRoute();
const router = useRouter();
const data = ref<List | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const keyword = ref(typeof route.query.q === "string" ? route.query.q : "");
const genre = ref(typeof route.query.genre === "string" ? route.query.genre : "");
const page = ref(Number(route.query.page) || 1);

async function load() {
  loading.value = true;
  try {
    data.value = await $fetch<List>("/api/qa", { query: { q: keyword.value || undefined, genre: genre.value || undefined, page: page.value } });
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
function apply(resetPage = true) {
  if (resetPage) page.value = 1;
  router.replace({ query: { q: keyword.value || undefined, genre: genre.value || undefined, page: page.value > 1 ? String(page.value) : undefined } });
  load();
}
function pickGenre(id: string) {
  genre.value = genre.value === id ? "" : id;
  apply();
}
function move(delta: number) {
  page.value += delta;
  apply(false);
  window.scrollTo({ top: 0 });
}
const lastPage = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.total / data.value.size)) : 1));
onMounted(load);
</script>

<template>
  <div>
    <AppHeader />
    <main class="page">
      <h1>Q&amp;A</h1>
      <p class="note">みなさまから寄せられた質問に、専門の相談員がお答えしています。質問した方が特定されないよう、内容の一部を変えて掲載しています。</p>

      <form class="search" role="search" @submit.prevent="apply()">
        <label class="field" for="qa-q">キーワードで探す</label>
        <div class="row">
          <input id="qa-q" v-model="keyword" type="text" maxlength="50" placeholder="例：不登校、職場の人間関係" />
          <button type="submit">探す</button>
        </div>
      </form>
      <div v-if="data" class="genres" role="group" aria-label="ジャンルで絞り込む">
        <button v-for="g in data.genres" :key="g.genreId" type="button" class="chip" :class="{ on: genre === g.genreId }" :aria-pressed="genre === g.genreId" @click="pickGenre(g.genreId)">
          {{ g.name }}
        </button>
      </div>

      <NuxtLink v-if="data?.features.qaPost" class="button secondary post" to="/qa/post">質問を投稿する</NuxtLink>

      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="data">
        <p v-if="data.items.length === 0" class="card note">該当するQ&amp;Aは見つかりませんでした。言葉を変えて、もう一度お試しください。</p>
        <ul v-else class="list">
          <li v-for="it in data.items" :key="it.questionId">
            <NuxtLink :to="`/qa/${it.questionId}`" class="card item">
              <span class="meta">
                <span v-if="it.featured" class="tag featured">注目</span>
                <span v-if="it.genre" class="tag">{{ it.genre }}</span>
                <span class="date">{{ formatShortDate(it.publishedAt) }}</span>
              </span>
              <span class="q">Q. {{ it.question }}<template v-if="it.questionCut">…</template></span>
              <span class="a">A. {{ it.answerPreview }}…</span>
            </NuxtLink>
          </li>
        </ul>
        <div v-if="lastPage > 1" class="pager">
          <button type="button" class="secondary" :disabled="page <= 1" @click="move(-1)">前へ</button>
          <span>{{ page }} / {{ lastPage }}</span>
          <button type="button" class="secondary" :disabled="page >= lastPage" @click="move(1)">次へ</button>
        </div>
      </template>
      <EmergencyLink />
    </main>
  </div>
</template>

<style scoped>
.search .row { display: flex; gap: 8px; }
.search .row button { width: auto; white-space: nowrap; }
.genres { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.chip { width: auto; padding: 6px 14px; font-size: 0.85rem; font-weight: 400; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 999px; }
.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.post { margin-bottom: 16px; }
.list { list-style: none; margin: 0; padding: 0; }
.item { display: block; color: var(--fg); text-decoration: none; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 0.8rem; color: var(--muted); }
.tag { padding: 1px 10px; background: #e9ece9; border-radius: 999px; }
.tag.featured { background: var(--accent); color: #fff; }
.q { display: block; font-weight: 600; overflow-wrap: anywhere; }
.a { display: block; margin-top: 6px; font-size: 0.9rem; color: var(--muted); overflow-wrap: anywhere; }
.pager { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 16px 0; }
.pager button { width: auto; padding: 8px 18px; }
</style>
