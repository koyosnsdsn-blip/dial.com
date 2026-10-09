<script setup lang="ts">
// 運営画面（相談員・運営管理者）／クライアント管理サイトのログイン（1段階目：メールアドレス＋パスワード）。
// 役割ごとにログイン画面を分けている（pages/ops/login.vue、pages/client-admin/login.vue）。
// 入力されたメールアドレスから、役割ごとの内部用の識別子（s-… / c-…）を計算して Supabase Auth でログインする。
// そのため、同じメールアドレスで相談者・相談員・クライアント管理者として別々に登録でき、互いのログインには使えない（未決事項 2.13）。
// 成功後は必ず MFA の画面へ進み、MFA を通過するまで他の画面は開けない（ops/guard.ts）。
import { loginIdToEmail } from "../utils/nickname";
import { authClient } from "../ops/authClient";
import { useExpert, usePortalAdmin, useStaff } from "../ops/useStaff";

// role="staff"（/ops/login）は、相談員・運営管理者に加えて先生も受け付ける（staff の識別子で失敗したら expert の識別子でも試す）。
// role="expert"（/ops/expert-login）は先生だけ。同じメールアドレスで相談員と先生の両方に登録している人が、先生として入るための入口として残す
const props = defineProps<{ role: "staff" | "client_admin" | "expert" }>();
// 運営画面とクライアント管理サイトは、相談者側とは別の認証Cookieを使う（utils/authArea.ts）。同じブラウザで相談者側にも同時にログインできる
// 先生（expert）も、運営画面（/ops）と同じ認証Cookieを使う（未決事項 2.19）
const supabase = authClient(props.role === "client_admin" ? "client" : "ops");
const domain = useRuntimeConfig().public.nicknameDomain as string;

const isStaff = props.role === "staff";
const isExpert = props.role === "expert";
const email = ref("");
const password = ref("");
const busy = ref(false);
const errorMessage = ref("");

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  let { error } = await supabase.auth.signInWithPassword({
    email: await loginIdToEmail(props.role, email.value, domain),
    password: password.value,
  });
  // 相談員としては入れなかった場合だけ、先生としても試す。回数制限（429）のときは重ねて試さない
  if (error && props.role === "staff" && error.status !== 429) {
    ({ error } = await supabase.auth.signInWithPassword({
      email: await loginIdToEmail("expert", email.value, domain),
      password: password.value,
    }));
  }
  busy.value = false;

  if (error) {
    // アカウントの有無を推測されないよう、原因を細かく出し分けない（回数制限のみ区別する）
    errorMessage.value =
      error.status === 429
        ? "試行回数が上限に達しました。しばらく時間をおいてから再度お試しください。"
        : "メールアドレスまたはパスワードが正しくありません。";
    return;
  }
  password.value = "";
  // 同じ領域で別のアカウントに入り直した場合に、前のアカウントの表示が残らないようにする（相談者側の表示は、別のCookieなので触らない）
  useStaff().value = null;
  usePortalAdmin().value = null;
  useExpert().value = null;
  await navigateTo(props.role === "client_admin" ? "/client-admin/mfa" : "/ops/mfa");
}
</script>

<template>
  <div class="auth-page">
    <main class="card">
      <h1>{{ isStaff ? "ダイヤル.com 管理画面" : isExpert ? "ダイヤル.com 先生用ログイン" : "ダイヤル.com クライアント管理サイト" }}</h1>
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
      <p class="note">
        <NuxtLink v-if="isStaff" to="/client-admin/login">クライアントの管理者の方はこちら</NuxtLink>
        <NuxtLink v-else to="/ops/login">ダイヤル・サービスの相談員・運営管理者・先生の方はこちら</NuxtLink>
      </p>
      <p v-if="isStaff" class="note">相談員・運営管理者・先生（回答をお寄せいただく専門家）は、同じ画面からログインできます。</p>
    </main>
  </div>
</template>
