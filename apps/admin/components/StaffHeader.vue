<script setup lang="ts">
const staff = useStaff();
const isAdmin = computed(() => staff.value?.role === "admin");
const roleLabel = computed(() => (isAdmin.value ? "運営管理者" : "相談員"));
</script>

<template>
  <header class="staff-header">
    <nav class="nav">
      <NuxtLink to="/" class="brand">ダイヤル.com 管理</NuxtLink>
      <NuxtLink to="/">ダッシュボード</NuxtLink>
      <NuxtLink v-if="isAdmin" to="/clients">契約クライアント</NuxtLink>
      <NuxtLink v-if="isAdmin" to="/staff">相談員の管理</NuxtLink>
      <NuxtLink v-if="isAdmin" to="/audit">監査ログ</NuxtLink>
    </nav>
    <div class="who">
      <span v-if="staff">{{ staff.name }}（{{ roleLabel }}）</span>
      <button class="secondary small" type="button" @click="signOut">ログアウト</button>
    </div>
  </header>
</template>

<style scoped>
.staff-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.nav { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; font-size: 14px; }
.nav a { color: var(--muted); text-decoration: none; }
.nav a.router-link-exact-active { color: var(--fg); font-weight: 600; }
.nav a.router-link-active:not([href="/"]) { color: var(--fg); font-weight: 600; }
.nav .brand { font-weight: 700; color: var(--fg); margin-right: 8px; }
.who { display: flex; align-items: center; gap: 12px; font-size: 14px; }
button.small { margin: 0; width: auto; padding: 6px 12px; font-size: 13px; }
</style>
