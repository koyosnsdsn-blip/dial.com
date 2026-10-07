<script setup lang="ts">
// ログインとMFAは通過したが、相談員・運営管理者として登録されていない（または失効している）アカウント。
// 利用者（相談者）アカウントやクライアント管理者アカウントで管理画面にログインした場合もここに来る。

import { signOut } from "../../ops/useStaff";</script>

<template>
  <main class="card">
    <h1>ご利用いただけません</h1>
    <p class="note">
      このアカウントには管理画面を利用する権限がありません。<br />
      権限が必要な場合は、ダイヤル・サービスの運営管理者にお問い合わせください。
    </p>
    <button class="secondary" type="button" @click="signOut">ログアウト</button>
  </main>
</template>
