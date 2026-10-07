<script setup lang="ts">
// ログイン画面のアドレス。ニックネームの入口（登録済みの方）へ案内する。
// ログインが必要な画面から来たときの理由（reason）は引き継ぐ（components/EntryForm.vue で案内を出す）
const reason = useRoute().query.reason;
await navigateTo({ path: "/start/nickname", query: { tab: "login", ...(typeof reason === "string" ? { reason } : {}) } }, { replace: true });
</script>

<template><div></div></template>
