<script setup lang="ts">
// 新規登録：ニックネームとパスワードだけで登録する。メールアドレス・氏名・所属は聞かない。
// 招待コードをお持ちの場合は、ここで一緒に入力できる（あとからでも入力できる）。
// 【2026-09-30 仕様変更】メールアドレスを使わない方式（要件 8.4 からの変更。未決事項一覧 2.12）
// 【仮】利用規約・プライバシーポリシーへの同意の取得と版の記録（要件 10.8）は、文書が未整備のため未実装
const supabase = useSupabaseClient();

const nickname = ref("");
const password = ref("");
const password2 = ref("");
const inviteCode = ref("");
const busy = ref(false);
const errorMessage = ref("");

async function submit() {
  errorMessage.value = "";
  const problem = nicknameProblem(nickname.value);
  if (problem === "length") {
    errorMessage.value = "ニックネームは2〜20文字で入力してください。";
    return;
  }
  if (problem === "chars") {
    errorMessage.value = "ニックネームに、空白や「@」は使えません。";
    return;
  }
  if (password.value.length < 8) {
    errorMessage.value = "パスワードは8文字以上にしてください。";
    return;
  }
  if (password.value !== password2.value) {
    errorMessage.value = "確認用のパスワードが一致しません。";
    return;
  }
  busy.value = true;
  try {
    await $fetch<unknown>("/api/signup", { method: "POST", body: { nickname: nickname.value, password: password.value } });
    const { error } = await supabase.auth.signInWithPassword({ email: await nicknameToEmail(nickname.value, useRuntimeConfig().public.nicknameDomain as string), password: password.value });
    if (error) {
      errorMessage.value = "登録は完了しました。ログイン画面から、ニックネームとパスワードでログインしてください。";
      return;
    }
    password.value = "";
    password2.value = "";
    // 招待コードは、入力があれば続けて登録する。うまくいかなくても登録自体は完了しているので、入力画面へ案内する
    if (inviteCode.value.trim()) {
      try {
        await $fetch<unknown>("/api/invite", { method: "POST", body: { code: inviteCode.value } });
      } catch {
        await navigateTo("/invite");
        return;
      }
    }
    await navigateTo("/consult");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="page narrow">
    <h1>新規登録</h1>
    <form class="card" @submit.prevent="submit">
      <p class="note">メールアドレスやお名前の入力は必要ありません。</p>
      <label class="field" for="nickname">ニックネーム（2〜20文字）</label>
      <input id="nickname" v-model="nickname" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20" required />
      <p class="note">ログインのときに使います。本名や、ご自身が特定される名前は使わないでください。</p>
      <label class="field" for="pw">パスワード（8文字以上）</label>
      <input id="pw" v-model="password" type="password" autocomplete="new-password" minlength="8" maxlength="72" required />
      <label class="field" for="pw2">パスワード（確認）</label>
      <input id="pw2" v-model="password2" type="password" autocomplete="new-password" minlength="8" maxlength="72" required />
      <p class="notice warn" style="margin-top: 14px">
        <strong>ニックネームとパスワードは、忘れないように控えておいてください。</strong>
        メールアドレスを登録しないため、忘れた場合に再設定ができません。
      </p>
      <label class="field" for="code">招待コード（お持ちの方のみ）</label>
      <input id="code" v-model="inviteCode" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
      <button type="submit" :disabled="busy" style="margin-top: 20px">{{ busy ? "登録しています…" : "登録してはじめる" }}</button>
    </form>
    <p class="note">すでに登録済みの方は <NuxtLink to="/login">ログイン</NuxtLink></p>
    <EmergencyLink />
  </main>
</template>
