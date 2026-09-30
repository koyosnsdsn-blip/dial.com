<script setup lang="ts">
// 運営からのお知らせ（要件 7.14.2）。ログイン後の画面上部に表示する。取得できなくても画面は表示する。
type Notice = { noticeId: string; body: string };
const notices = useState<Notice[] | null>("notices", () => null);
onMounted(async () => {
  if (notices.value !== null) return;
  try {
    notices.value = await $fetch<Notice[]>("/api/notices");
  } catch {
    notices.value = [];
  }
});
</script>

<template>
  <div v-if="notices && notices.length" class="notices" role="status">
    <p v-for="n in notices" :key="n.noticeId">{{ n.body }}</p>
  </div>
</template>

<style scoped>
.notices { padding: 10px 16px; background: #eef3fb; border-bottom: 1px solid #c9d8ee; font-size: 0.9rem; }
.notices p { margin: 0; white-space: pre-wrap; }
.notices p + p { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #c9d8ee; }
</style>
