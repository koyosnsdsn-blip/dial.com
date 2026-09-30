<script setup lang="ts">
// 以前のログイン画面のアドレス。ニックネームの入口（登録済みの方）へ案内する
await navigateTo({ path: "/start/nickname", query: { tab: "login" } }, { replace: true });
</script>

<template><div></div></template>
