<script setup lang="ts">
// ログイン後の共通ヘッダー。クライアントのロゴ・名称、会員区分は表示しない（要件 8.6.1.1・8.6.2）
</script>

<template>
  <div>
  <header class="app-header">
    <NuxtLink to="/consult" class="brand">ダイヤル.com</NuxtLink>
    <nav>
      <NuxtLink to="/consult">ご相談</NuxtLink>
      <NuxtLink to="/mypage">マイページ</NuxtLink>
    </nav>
  </header>
  <NoticeBanner />
  </div>
</template>

<style scoped>
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.brand { font-weight: 700; color: var(--fg); text-decoration: none; }
nav { display: flex; gap: 16px; font-size: 14px; }
nav a { color: var(--muted); text-decoration: none; padding: 6px 0; }
nav a.router-link-active { color: var(--accent); font-weight: 600; }
</style>
