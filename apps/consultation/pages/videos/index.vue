<script setup lang="ts">
// 動画の一覧（要件 4章）。自分が視聴できる動画だけが並ぶ。会員区分や配信範囲は表示しない
type Item = { videoId: string; title: string; description: string | null; category: string | null; durationSec: number | null; publishedAt: string | null };
const items = ref<Item[]>([]);
const loading = ref(true);
const errorMessage = ref("");
onMounted(async () => {
  try {
    items.value = (await $fetch<{ items: Item[] }>("/api/videos")).items;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <AppHeader />
    <main class="page">
      <h1>動画</h1>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-else-if="items.length === 0" class="card note">現在、ご覧いただける動画はありません。</p>
      <ul v-else class="list">
        <li v-for="v in items" :key="v.videoId">
          <NuxtLink :to="`/videos/${v.videoId}`" class="card item">
            <span class="meta">
              <span v-if="v.category" class="tag">{{ v.category }}</span>
              <span>{{ formatShortDate(v.publishedAt) }}</span>
              <span v-if="v.durationSec">{{ formatDuration(v.durationSec) }}</span>
            </span>
            <strong>{{ v.title }}</strong>
            <span v-if="v.description" class="desc">{{ v.description }}</span>
          </NuxtLink>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; }
.item { display: block; color: var(--fg); text-decoration: none; }
.meta { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 4px; font-size: 0.8rem; color: var(--muted); }
.tag { padding: 1px 10px; background: #e9ece9; border-radius: 999px; }
.desc { display: block; margin-top: 4px; font-size: 0.9rem; color: var(--muted); white-space: pre-wrap; }
</style>
