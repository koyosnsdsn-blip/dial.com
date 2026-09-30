<script setup lang="ts">
// 公開済みの Q&A の管理（要件 7.11.2）
type Item = { questionId: string; displayId: string | null; operatorCreated: boolean; fromCase: boolean; genre: string | null; excerpt: string; publishedAt: string | null; unpublished: boolean; unpublishReason: string | null; featured: boolean; viewCount: number; openReports: number };
type List = { total: number; genres: { genreId: string; name: string }[]; items: Item[] };
const data = ref<List | null>(null);
const filters = reactive({ genre: "", state: "", sort: "", q: "" });
const loading = ref(true);
const errorMessage = ref("");
async function load() {
  try {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) if (v) query[k] = v;
    data.value = await $fetch<List>("/api/qa-articles", { query });
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
watch(() => [filters.genre, filters.state, filters.sort], load);
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm">
      <h1>Q&amp;A</h1>
      <QaTabs />
      <form class="row" @submit.prevent="load">
        <select v-model="filters.genre" style="width: auto" aria-label="ジャンル">
          <option value="">すべてのジャンル</option>
          <option v-for="g in data?.genres ?? []" :key="g.genreId" :value="g.genreId">{{ g.name }}</option>
        </select>
        <select v-model="filters.state" style="width: auto" aria-label="状態">
          <option value="">すべての状態</option>
          <option value="public">公開中</option>
          <option value="unpublished">非公開・下書き</option>
        </select>
        <select v-model="filters.sort" style="width: auto" aria-label="並び順">
          <option value="">公開日の新しい順</option>
          <option value="views">閲覧数の多い順</option>
          <option value="reports">通報の多い順</option>
        </select>
        <input v-model="filters.q" style="width: 200px" placeholder="質問文で検索" maxlength="50" />
        <button class="secondary small" type="submit">検索</button>
      </form>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="data && data.items.length === 0" class="panel note">該当する記事はありません。</p>
      <div v-else-if="data" class="scroll" style="margin-top: 12px">
        <table class="grid">
          <thead><tr><th>状態</th><th>公開日</th><th>ジャンル</th><th>質問（冒頭）</th><th>閲覧</th><th>通報</th></tr></thead>
          <tbody>
            <tr v-for="it in data.items" :key="it.questionId">
              <td>
                <span class="badge" :class="{ on: !it.unpublished }">{{ it.unpublished ? (it.unpublishReason === "draft" ? "下書き" : it.unpublishReason === "auto_report" ? "一時非公開（通報）" : "非公開") : "公開中" }}</span>
                <span v-if="it.featured" class="badge wait">注目</span>
              </td>
              <td>{{ it.publishedAt ? formatDate(it.publishedAt) : "—" }}</td>
              <td>{{ it.genre ?? "—" }}</td>
              <td>
                <NuxtLink :to="`/articles/${it.questionId}`">{{ it.excerpt }}…</NuxtLink>
                <div class="muted">{{ it.operatorCreated ? (it.fromCase ? "運営作成（相談が素材）" : "運営作成") : `投稿 ${it.displayId ?? "（紐付け削除済み）"}` }}</div>
              </td>
              <td>{{ it.viewCount }}</td>
              <td><span v-if="it.openReports" class="badge alert">{{ it.openReports }}</span><span v-else>0</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="data" class="note">{{ data.total }} 件（最大300件まで表示）</p>
    </main>
  </div>
</template>
