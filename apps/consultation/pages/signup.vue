<script setup lang="ts">
// 新規登録（要件 8.4・8.5）。個人のメールアドレスとパスワードだけで登録する。氏名・所属は聞かない（3.10.5）。
// 登録後、確認メールのリンクを開くとログインできるようになる。招待コードはログイン後に入力する。
// 【仮】利用規約・プライバシーポリシーへの同意の取得と版の記録（要件 10.8）は、文書が未整備のため未実装
const supabase = useSupabaseClient();

const email = ref("");
const password = ref("");
const password2 = ref("");
const busy = ref(false);
const sent = ref(false);
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
  const { error } = await supabase.auth.signUp({
    email: email.value.trim(),
    password: password.value,
    options: { emailRedirectTo: `${window.location.origin}/confirm` },
  });
  busy.value = false;
  if (error) {
    if (error.status === 429) {
      errorMessage.value = "ただいま確認メールを送信できません。しばらく時間をおいてから、もう一度お試しください。";
    } else if (error.code === "weak_password") {
      errorMessage.value = "このパスワードは使えません。別のパスワードにしてください。";
    } else {
      errorMessage.value = "登録できませんでした。入力内容をお確かめください。";
    }
    return;
  }
  // すでに登録済みのアドレスでも同じ表示にする（登録の有無を第三者に推測させない）
  password.value = "";
  password2.value = "";
  sent.value = true;
}
</script>

<template>
  <main class="page narrow">
    <h1>新規登録</h1>
    <div v-if="sent" class="card">
      <p><strong>確認メールをお送りしました。</strong></p>
      <p>メールに記載のリンクを開くと、登録が完了します。届かない場合は、迷惑メールのフォルダもご確認ください。</p>
      <NuxtLink class="button secondary" to="/login">ログイン画面へ</NuxtLink>
    </div>
    <form v-else class="card" @submit.prevent="submit">
      <p class="notice">
        ご自身の<strong>個人のメールアドレス</strong>で登録してください。勤務先のアドレスは使わないでください。
        お知らせのメールが届きますので、ご自身だけが見られるアドレスをおすすめします。
      </p>
      <label class="field" for="email">メールアドレス</label>
      <input id="email" v-model="email" type="email" autocomplete="email" required />
      <label class="field" for="pw">パスワード（8文字以上）</label>
      <input id="pw" v-model="password" type="password" autocomplete="new-password" minlength="8" required />
      <label class="field" for="pw2">パスワード（確認）</label>
      <input id="pw2" v-model="password2" type="password" autocomplete="new-password" minlength="8" required />
      <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
      <button type="submit" :disabled="busy" style="margin-top: 20px">{{ busy ? "送信中…" : "登録する" }}</button>
      <p class="note" style="margin-top: 12px">お名前やご所属の入力は必要ありません。</p>
    </form>
    <p class="note">すでに登録済みの方は <NuxtLink to="/login">ログイン</NuxtLink></p>
  </main>
</template>
