<script setup lang="ts">
// トップ（ログイン前）。サーバー側で生成する公開ページ。
// 【仮】文面は暫定。一般向けと企業会員向けの入口の出し分け（要件 8.6.1）、クライアント別ランディングページ（8.6.2）は未実装
</script>

<template>
  <main class="page narrow">
    <h1>ダイヤル.com</h1>
    <div class="card stack">
      <p>専門の相談員に、メッセージでご相談いただけます。</p>
      <NuxtLink class="button" to="/signup">はじめての方（新規登録）</NuxtLink>
      <NuxtLink class="button secondary" to="/login">ログイン</NuxtLink>
      <p class="note">ニックネームとパスワードを決めるだけで始められます。メールアドレスは必要ありません。</p>
    </div>
    <EmergencyLink />
  </main>
</template>
