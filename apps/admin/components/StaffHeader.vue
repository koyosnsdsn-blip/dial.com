<script setup lang="ts">
const staff = useStaff();
const roleLabel = computed(() => (staff.value?.role === "admin" ? "運営管理者" : "相談員"));
</script>

<template>
  <header class="staff-header">
    <NuxtLink to="/" class="brand">ダイヤル.com 管理</NuxtLink>
    <div class="who">
      <span v-if="staff">{{ staff.name }}（{{ roleLabel }}）</span>
      <button class="secondary small" type="button" @click="signOut">ログアウト</button>
    </div>
  </header>
</template>

<style scoped>
.staff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.brand { font-weight: 700; color: var(--fg); text-decoration: none; }
.who { display: flex; align-items: center; gap: 12px; font-size: 14px; }
button.small { margin: 0; width: auto; padding: 6px 12px; font-size: 13px; }
</style>
