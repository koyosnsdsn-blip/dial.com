<script setup lang="ts">
// 利用者のログイン（ニックネームとパスワード）。「ログイン状態を保持する」の選択肢は設けない（＝常に無効。要件 10.4）
// 「@」を含む入力は、メールアドレスで登録されたアカウントとして扱う。
const supabase = useSupabaseClient();

const nickname = ref("");
const password = ref("");
const busy = ref(false);
const errorMessage = ref("");

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  const id = nickname.value.trim();
  const email = id.includes("@") ? id : await nicknameToEmail(id);
  const { error } = await supabase.auth.signInWithPassword({ email, password: password.value });
  busy.value = false;

  if (error) {
    // アカウントの有無を推測されないよう、原因を細かく出し分けない（回数制限のみ区別する）
    errorMessage.value =
      error.status === 429
        ? "試行回数が上限に達しました。しばらく時間をおいてから、もう一度お試しください。"
        : "ニックネームまたはパスワードが正しくありません。";
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
      <label class="field" for="nickname">ニックネーム</label>
      <input id="nickname" v-model="nickname" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required />
      <label class="field" for="password">パスワード</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" required />
      <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
      <button type="submit" :disabled="busy" style="margin-top: 20px">{{ busy ? "確認中…" : "ログイン" }}</button>
    </form>
    <p class="note"><NuxtLink to="/signup">はじめての方（新規登録）</NuxtLink>　／　<NuxtLink to="/forgot">パスワードを忘れた方</NuxtLink></p>
    <EmergencyLink />
  </main>
</template>
