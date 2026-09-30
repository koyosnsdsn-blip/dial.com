<script setup lang="ts">
// 以前の新規登録画面のアドレス。ニックネームの入口（はじめての方）へ案内する
await navigateTo({ path: "/start/nickname", query: { tab: "signup" } }, { replace: true });
</script>

<template><div></div></template>
