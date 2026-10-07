<script setup lang="ts">
// ログイン画面のアドレス。入口（ニックネーム・招待コード・メールアドレス）は人によって違うため、入口を選ぶトップへ案内する。
// ログインが必要な画面から来たときの理由（reason）は引き継ぐ（utils/loginReason.ts）
const reason = useRoute().query.reason;
await navigateTo({ path: "/", query: typeof reason === "string" ? { reason } : {} }, { replace: true });
</script>

<template><div></div></template>
