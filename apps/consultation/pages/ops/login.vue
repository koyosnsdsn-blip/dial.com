<script setup lang="ts">
// 相談員・運営管理者のログイン（1段階目：メールアドレス＋パスワード）。
// 成功後は必ず /mfa へ進み、MFA を通過するまで他の画面は開けない（middleware/auth.global.ts）。
const supabase = useSupabaseClient();

const email = ref("");
const password = ref("");
const busy = ref(false);
const errorMessage = ref("");

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: password.value,
  });
  busy.value = false;

  if (error) {
    // アカウントの有無を推測されないよう、原因を細かく出し分けない（回数制限と未確認メールのみ区別する）
    if (error.status === 429) {
      errorMessage.value = "試行回数が上限に達しました。しばらく時間をおいてから再度お試しください。";
    } else if (error.code === "email_not_confirmed") {
      errorMessage.value = "メールアドレスの確認が済んでいません。届いている確認メールのリンクを開いてください。";
    } else {
      errorMessage.value = "メールアドレスまたはパスワードが正しくありません。";
    }
    return;
  }
  password.value = "";
  await navigateTo("/ops/mfa");
}
</script>

<template>
  <div class="auth-page">
  <main class="card">
    <h1>ダイヤル.com 管理画面</h1>
    <form @submit.prevent="submit">
      <label for="email">メールアドレス</label>
      <input id="email" v-model="email" type="email" autocomplete="username" required />
      <label for="password">パスワード</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" required />
      <button type="submit" :disabled="busy">{{ busy ? "確認中…" : "ログイン" }}</button>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    </form>
    <p class="note" style="margin-top: 24px">
      このあと認証アプリ（Google Authenticator 等）の6桁コードの入力が必要です。
    </p>
  </main>
  </div>
</template>
