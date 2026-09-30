<script setup lang="ts">
// パスワードを忘れた場合。
//   メールアドレスで登録した方 … 再設定用のメールを送る（要件 10.3.1）
//   ニックネームで登録した方   … メールアドレスがないため再設定できない。新しく登録し直す案内をする（未決事項一覧 2.12）
const supabase = useSupabaseClient();
const route = useRoute();
const byEmail = ref(route.query.by === "email");
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
    <h1>パスワードを忘れた方へ</h1>

    <template v-if="byEmail">
      <div v-if="sent" class="card">
        <p>ご登録のアドレスであれば、再設定用のメールをお送りしました。メールに記載のリンクを、この端末のこのブラウザで開いてください。</p>
        <NuxtLink class="button secondary" :to="{ path: '/start/email', query: { tab: 'login' } }">ログインへ戻る</NuxtLink>
      </div>
      <form v-else class="card" @submit.prevent="submit">
        <label class="field" for="email">ご登録のメールアドレス</label>
        <input id="email" v-model="email" type="email" autocomplete="email" required />
        <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
        <button type="submit" :disabled="busy" style="margin-top: 20px">{{ busy ? "送信中…" : "再設定用のメールを送る" }}</button>
      </form>
      <p class="note"><button type="button" class="plain" @click="byEmail = false">ニックネームで登録した方はこちら</button></p>
    </template>

    <template v-else>
      <div class="card stack">
        <p>ニックネームで登録した場合、メールアドレスをお預かりしていないため、<strong>パスワードの再設定はできません。</strong></p>
        <p>お手数ですが、新しいニックネームで登録し直してください。新しい登録でも、同じようにご相談いただけます（以前のご相談の記録は、新しい登録には引き継がれません）。</p>
        <NuxtLink class="button" to="/">入口へ戻って登録する</NuxtLink>
      </div>
      <p class="note"><button type="button" class="plain" @click="byEmail = true">メールアドレスで登録した方はこちら</button></p>
    </template>
    <EmergencyLink />
  </main>
</template>
