<script setup lang="ts">
// パスワードを忘れた場合の案内。
// メールアドレスを登録しない方式のため、パスワードの再設定はできない（未決事項一覧 2.12）。
// 新しく登録すれば相談は続けられること、緊急時の案内を伝える。
</script>

<template>
  <main class="page narrow">
    <h1>パスワードを忘れた方へ</h1>
    <div class="card stack">
      <p>このサービスは、メールアドレスを登録せずにご利用いただけるようにしています。そのため、<strong>パスワードの再設定はできません。</strong></p>
      <p>お手数ですが、新しいニックネームで登録し直してください。新しい登録でも、同じようにご相談いただけます（以前のご相談の記録は、新しい登録には引き継がれません）。</p>
      <NuxtLink class="button" to="/signup">新しく登録する</NuxtLink>
      <NuxtLink class="button secondary" to="/login">ログイン画面へ戻る</NuxtLink>
    </div>
    <EmergencyLink />
  </main>
</template>
