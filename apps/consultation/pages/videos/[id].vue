<script setup lang="ts">
// 動画の視聴（要件 4.3・4.4）。視聴できない動画は「見つかりません」とだけ表示する（理由は出さない）
type Detail = { videoId: string; title: string; description: string | null; category: string | null; durationSec: number | null; publishedAt: string | null; embedUrl: string | null };
const route = useRoute();
const detail = ref<Detail | null>(null);
const loading = ref(true);
const errorMessage = ref("");
onMounted(async () => {
  try {
    detail.value = await $fetch<Detail>(`/api/videos/${String(route.params.id)}`);
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
      <p><NuxtLink to="/videos">← 動画の一覧へ</NuxtLink></p>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="detail">
        <h1>{{ detail.title }}</h1>
        <div v-if="detail.embedUrl" class="player">
          <iframe :src="detail.embedUrl" :title="detail.title" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
        <p v-else class="card note">この動画は、ただいま準備中です。</p>
        <p class="note">
          <span v-if="detail.category">{{ detail.category }}　</span>{{ formatShortDate(detail.publishedAt) }}<span v-if="detail.durationSec">　{{ formatDuration(detail.durationSec) }}</span>
        </p>
        <p v-if="detail.description" class="desc">{{ detail.description }}</p>
      </template>
    </main>
  </div>
</template>

<style scoped>
.player { position: relative; width: 100%; padding-top: 56.25%; margin-bottom: 12px; background: #000; border-radius: 12px; overflow: hidden; }
.player iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.desc { white-space: pre-wrap; }
</style>
