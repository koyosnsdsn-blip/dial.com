<script setup lang="ts">
// 新しいパスワードの設定（再設定リンクから、またはマイページから）。ログイン中のみ開ける。
const supabase = useSupabaseClient();
const password = ref("");
const password2 = ref("");
const busy = ref(false);
const done = ref(false);
const errorMessage = ref("");

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
      error.code === "weak_password" || error.code === "same_password"
        ? "このパスワードは使えません。別のパスワードにしてください。"
        : "パスワードを変更できませんでした。もう一度ログインしてからお試しください。";
    return;
  }
  password.value = "";
  password2.value = "";
  done.value = true;
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="page narrow">
      <h1>パスワードの変更</h1>
      <div v-if="done" class="card">
        <p>パスワードを変更しました。</p>
        <NuxtLink class="button" to="/consult">ご相談の画面へ</NuxtLink>
      </div>
      <form v-else class="card" @submit.prevent="submit">
        <label class="field" for="pw">新しいパスワード（8文字以上）</label>
        <input id="pw" v-model="password" type="password" autocomplete="new-password" minlength="8" required />
        <label class="field" for="pw2">新しいパスワード（確認）</label>
        <input id="pw2" v-model="password2" type="password" autocomplete="new-password" minlength="8" required />
        <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
        <button type="submit" :disabled="busy" style="margin-top: 20px">{{ busy ? "変更中…" : "変更する" }}</button>
      </form>
    </main>
  </div>
</template>
