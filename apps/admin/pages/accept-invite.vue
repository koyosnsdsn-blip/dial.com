<script setup lang="ts">
// 招待メールのリンクから開く画面：パスワードを設定し、2段階認証の登録（/mfa）へ進む。
// Supabase の招待リンクは、認証後に URL のハッシュ（#access_token=...&type=invite）でセッションを渡してくる。
// ブラウザ用クライアントは PKCE 方式のためハッシュを自動では読まないので、ここで明示的にセッションへ設定する。
const supabase = useSupabaseClient();

type Mode = "loading" | "form" | "invalid";
const mode = ref<Mode>("loading");
const password = ref("");
const password2 = ref("");
const busy = ref(false);
const errorMessage = ref("");

onMounted(async () => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const linkError = hash.get("error_description");

  // トークンをアドレスバーや履歴に残さない
  if (window.location.hash) history.replaceState(null, "", window.location.pathname);

  if (linkError) {
    mode.value = "invalid";
    return;
  }
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) {
      mode.value = "invalid";
      return;
    }
  }
  const { data } = await supabase.auth.getSession();
  mode.value = data.session ? "form" : "invalid";
});

async function submit() {
  errorMessage.value = "";
  if (password.value.length < 8) {
    errorMessage.value = "パスワードは8文字以上にしてください。";
    return;
  }
  if (password.value !== password2.value) {
    errorMessage.value = "確認用のパスワードが一致しません。";
    return;
  }
  busy.value = true;
  const { error } = await supabase.auth.updateUser({ password: password.value });
  busy.value = false;
  if (error) {
    errorMessage.value =
      error.code === "weak_password"
        ? "このパスワードは使えません。別のパスワードにしてください。"
        : "パスワードを設定できませんでした。招待メールのリンクをもう一度開いてください。";
    return;
  }
  password.value = "";
  password2.value = "";
  await navigateTo("/mfa");
}
</script>

<template>
  <div class="auth-page">
    <main class="card">
      <h1>パスワードの設定</h1>
      <p v-if="mode === 'loading'" class="note">確認しています…</p>
      <template v-else-if="mode === 'invalid'">
        <p class="error">招待リンクが無効か、有効期限が切れています。</p>
        <p class="note">運営管理者に、招待メールの再送を依頼してください。</p>
      </template>
      <form v-else @submit.prevent="submit">
        <p class="note">ダイヤル.com 管理画面へようこそ。ログインに使うパスワードを設定してください。続けて2段階認証（認証アプリ）を登録します。</p>
        <label for="pw">パスワード（8文字以上）</label>
        <input id="pw" v-model="password" type="password" autocomplete="new-password" minlength="8" required />
        <label for="pw2">パスワード（確認）</label>
        <input id="pw2" v-model="password2" type="password" autocomplete="new-password" minlength="8" required />
        <button type="submit" :disabled="busy">{{ busy ? "設定中…" : "設定して続ける" }}</button>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      </form>
    </main>
  </div>
</template>
