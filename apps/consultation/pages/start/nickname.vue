<script setup lang="ts">
// 入口：ニックネームではじめる（3種類の入口のひとつ。共通のフォームは components/EntryForm.vue）
useHead({ title: "ニックネームではじめる｜ダイヤル.com" });
</script>

<template>
  <main class="page narrow">
    <h1>ニックネームではじめる</h1>
    <p class="note">ニックネームとパスワードを決めるだけで始められます。メールアドレスは必要ありません。</p>
    <EntryForm mode="nickname" />
    <p class="note"><NuxtLink to="/">ほかの入口を見る</NuxtLink></p>
    <EmergencyLink />
  </main>
</template>
