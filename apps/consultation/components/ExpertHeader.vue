<script setup lang="ts">
// 先生用の画面の見出し（運営画面の StaffHeader とは別。先生には運営のメニューを見せない）
import { signOut, useExpert } from "../ops/useStaff";
const expert = useExpert();
</script>

<template>
  <header class="expert-header">
    <nav class="nav">
      <NuxtLink to="/ops/expert" class="brand">ダイヤル.com 先生用</NuxtLink>
    </nav>
    <div class="who">
      <span v-if="expert">{{ expert.name }} 先生（{{ expert.qualification }}）</span>
      <button class="secondary small" type="button" @click="signOut">ログアウト</button>
    </div>
  </header>
</template>

<style scoped>
.expert-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.nav { display: flex; align-items: center; gap: 16px; font-size: 14px; }
.nav .brand { font-weight: 700; color: var(--fg); text-decoration: none; }
.who { display: flex; align-items: center; gap: 12px; font-size: 14px; }
button.small { margin: 0; width: auto; padding: 6px 12px; font-size: 13px; }
</style>
