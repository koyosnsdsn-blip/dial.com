<script setup lang="ts">
// パスワードの再設定（要件 10.3.1）。登録済みのアドレスへ再設定用のリンクを送る。
const supabase = useSupabaseClient();
const email = ref("");
const busy = ref(false);
const sent = ref(false);
const errorMessage = ref("");

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  const { error } = await supabase.auth.resetPasswordForEmail(email.value.trim(), {
    redirectTo: `${window.location.origin}/confirm?next=update-password`,
  });
  busy.value = false;
  if (error && error.status === 429) {
    errorMessage.value = "ただいまメールを送信できません。しばらく時間をおいてから、もう一度お試しください。";
    return;
  }
  // 登録の有無にかかわらず同じ表示にする
  sent.value = true;
}
</script>

<template>
  <main class="page narrow">
    <h1>パスワードの再設定</h1>
    <div v-if="sent" class="card">
      <p>ご登録のアドレスであれば、再設定用のメールをお送りしました。メールに記載のリンクを、この端末のこのブラウザで開いてください。</p>
      <NuxtLink class="button secondary" to="/login">ログイン画面へ</NuxtLink>
    </div>
    <form v-else class="card" @submit.prevent="submit">
      <label class="field" for="email">ご登録のメールアドレス</label>
      <input id="email" v-model="email" type="email" autocomplete="email" required />
      <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
      <button type="submit" :disabled="busy" style="margin-top: 20px">{{ busy ? "送信中…" : "再設定用のメールを送る" }}</button>
    </form>
  </main>
</template>
