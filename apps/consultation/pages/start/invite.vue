<script setup lang="ts">
// 入口：招待コードをお持ちの方（3種類の入口のひとつ。共通のフォームは components/EntryForm.vue）
useHead({ title: "招待コードをお持ちの方｜ダイヤル.com" });
</script>

<template>
  <main class="page narrow">
    <h1>招待コードをお持ちの方</h1>
    <p class="note">勤務先などから招待コードの案内を受けた方の入口です。ニックネームとパスワードを決めて、招待コードを入力してください。</p>
    <EntryForm mode="invite" />
    <p class="note"><NuxtLink to="/">ほかの入口を見る</NuxtLink></p>
    <EmergencyLink />
  </main>
</template>
