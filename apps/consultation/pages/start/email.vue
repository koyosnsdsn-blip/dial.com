<script setup lang="ts">
// 入口：メールアドレスではじめる（3種類の入口のひとつ。共通のフォームは components/EntryForm.vue）
useHead({ title: "メールアドレスではじめる｜ダイヤル.com" });
</script>

<template>
  <main class="page narrow">
    <h1>メールアドレスではじめる</h1>
    <p class="note">メールアドレスで登録する入口です。パスワードを忘れたときに、メールで再設定できます。</p>
    <EntryForm mode="email" />
    <p class="note"><NuxtLink to="/">ほかの入口を見る</NuxtLink></p>
    <EmergencyLink />
  </main>
</template>
