<script setup lang="ts">
// 機能1（Q&A）の画面の切り替え
import { useStaff } from "../ops/useStaff";
const staff = useStaff();
</script>

<template>
  <nav class="tabs" aria-label="Q&amp;A の管理">
    <NuxtLink to="/ops/qa">回答待ち</NuxtLink>
    <NuxtLink to="/ops/articles">公開済みの記事</NuxtLink>
    <NuxtLink to="/ops/articles/new">記事を作成</NuxtLink>
    <NuxtLink to="/ops/qa-reports">通報</NuxtLink>
    <NuxtLink v-if="staff?.role === 'admin'" to="/ops/genres">ジャンル</NuxtLink>
  </nav>
</template>
