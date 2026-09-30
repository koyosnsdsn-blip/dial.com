<script setup lang="ts">
// 利用者のログイン。「ログイン状態を保持する」の選択肢は設けない（＝常に無効。要件 10.4）
const supabase = useSupabaseClient();

const email = ref("");
const password = ref("");
const busy = ref(false);
const errorMessage = ref("");

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
  busy.value = false;

  if (error) {
    // アカウントの有無を推測されないよう、原因を細かく出し分けない（回数制限と未確認メールのみ区別する）
    if (error.status === 429) {
      errorMessage.value = "試行回数が上限に達しました。しばらく時間をおいてから、もう一度お試しください。";
    } else if (error.code === "email_not_confirmed") {
      errorMessage.value = "メールアドレスの確認が済んでいません。届いている確認メールのリンクを開いてください。";
    } else {
      errorMessage.value = "メールアドレスまたはパスワードが正しくありません。";
    }
    return;
  }
  password.value = "";
  await navigateTo("/consult");
}
</script>

<template>
  <main class="page narrow">
    <h1>ログイン</h1>
    <form class="card" @submit.prevent="submit">
      <label class="field" for="email">メールアドレス</label>
      <input id="email" v-model="email" type="email" autocomplete="username" required />
      <label class="field" for="password">パスワード</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" required />
      <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
      <button type="submit" :disabled="busy" style="margin-top: 20px">{{ busy ? "確認中…" : "ログイン" }}</button>
    </form>
    <p class="note"><NuxtLink to="/forgot">パスワードをお忘れの方</NuxtLink>　／　<NuxtLink to="/signup">新規登録</NuxtLink></p>
    <EmergencyLink />
  </main>
</template>
