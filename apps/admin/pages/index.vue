<script setup lang="ts">
// ダッシュボード（要件 7.1）。現時点はログイン確認用の仮画面。
const staff = useStaff();
const roleLabel = computed(() => (staff.value?.role === "admin" ? "運営管理者" : "相談員"));
</script>

<template>
  <main class="card" style="max-width: 640px">
    <h1>ダッシュボード</h1>
    <p v-if="staff">
      {{ staff.name }} さん（{{ roleLabel }}）としてログインしています。
    </p>
    <p class="note">案件一覧・緊急フラグ等の画面は準備中です。</p>
    <button class="secondary" type="button" @click="signOut">ログアウト</button>
  </main>
</template>
