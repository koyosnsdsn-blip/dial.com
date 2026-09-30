<script setup lang="ts">
// 緊急時の案内への導線（要件 3.5）。相談の画面には常設する。
</script>

<template>
  <p class="emergency-link">
    <NuxtLink to="/emergency" target="_blank" rel="noopener">お急ぎのとき・危険を感じるときは こちら</NuxtLink>
  </p>
</template>

<style scoped>
.emergency-link {
  margin: 0;
  padding: 10px 14px;
  font-size: 14px;
  background: var(--warn-bg);
  border: 1px solid var(--warn-line);
  border-radius: 8px;
}
.emergency-link a { color: var(--warn-fg); font-weight: 600; }
</style>
