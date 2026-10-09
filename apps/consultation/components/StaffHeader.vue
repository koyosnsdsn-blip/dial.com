<script setup lang="ts">
import { signOut, useStaff } from "../ops/useStaff";
import { initNotifySound, setSoundEnabled, soundEnabled, soundLocked } from "../ops/notifySound";
const staff = useStaff();
const isAdmin = computed(() => staff.value?.role === "admin");
const roleLabel = computed(() => (isAdmin.value ? "運営管理者" : "相談員"));
// 通知音（このブラウザだけの設定）
onMounted(initNotifySound);
</script>

<template>
  <header class="staff-header">
    <nav class="nav">
      <NuxtLink to="/ops" class="brand">ダイヤル.com 管理</NuxtLink>
      <NuxtLink to="/ops">ダッシュボード</NuxtLink>
      <NuxtLink to="/ops/qa">Q&amp;A</NuxtLink>
      <NuxtLink v-if="isAdmin" to="/ops/clients">契約クライアント</NuxtLink>
      <NuxtLink v-if="isAdmin" to="/ops/staff">相談員の管理</NuxtLink>
      <NuxtLink to="/ops/menu">運営メニュー</NuxtLink>
      <NuxtLink v-if="isAdmin" to="/ops/audit">監査ログ</NuxtLink>
    </nav>
    <div class="who">
      <span v-if="soundEnabled && soundLocked" class="sound-hint" role="status">音を出すには、画面を一度クリックしてください</span>
      <button
        class="secondary small"
        type="button"
        :aria-pressed="soundEnabled"
        title="利用者からの新着メッセージ・新しい案件・緊急案件のときに音を鳴らします（このブラウザだけの設定）"
        @click="setSoundEnabled(!soundEnabled)"
      >
        {{ soundEnabled ? "🔔 通知音 ON" : "🔕 通知音 OFF" }}
      </button>
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
.nav a.router-link-active:not([href="/ops"]) { color: var(--fg); font-weight: 600; }
.nav .brand { font-weight: 700; color: var(--fg); margin-right: 8px; }
.who { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.sound-hint { color: var(--danger); font-size: 12px; }
button.small { margin: 0; width: auto; padding: 6px 12px; font-size: 13px; }
</style>
