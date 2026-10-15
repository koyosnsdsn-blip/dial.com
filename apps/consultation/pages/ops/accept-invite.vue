<script setup lang="ts">
// 招待・再設定のメールのリンクから開く画面（メールは server/ops/setupMail.ts が送る）：パスワードを設定し、2段階認証の登録（/mfa）へ進む。
// メールのリンクは ?token_hash=…&type=invite|recovery&area=ops|client の形。開いただけではトークンを使わず、「進む」ボタンを押したときに確認する
// （メールの先読みで、本人より先にトークンが使われるのを避けるため）。
// 招待されたアカウントの役割（相談員・運営管理者／クライアント管理者）は、ログインID（Auth 上のメールアドレス）の接頭辞で分かる。
// 設定が済んだら、役割に応じたMFA画面（/ops/mfa または /client-admin/mfa）へ進む。
// Supabase の招待リンクは、認証後に URL のハッシュ（#access_token=...&type=invite）でセッションを渡してくる。
// ブラウザ用クライアントは PKCE 方式のためハッシュを自動では読まないので、ここで明示的にセッションへ設定する。
import type { SupabaseClient } from "@supabase/supabase-js";
import { roleOfLoginEmail } from "../../utils/nickname";
import { authClient } from "../../ops/authClient";
// 相談員・運営管理者は運営画面用、クライアント管理者はクライアント管理サイト用の認証Cookieを使う（utils/authArea.ts）。
// どちらの招待かは、リンクのトークンに入っているログインID（メールアドレス）の接頭辞で決める（先生 x-… も運営画面側）。
// トークンを読む前（または、リンクを開き直したあと）は、運営画面側を仮に持っておき、セッションがある側に切り替える。
let supabase: SupabaseClient = authClient("ops");
const nicknameDomain = useRuntimeConfig().public.nicknameDomain as string;

type Mode = "loading" | "confirm" | "form" | "invalid";
// メールのリンクに付いた、確認前のトークン
let pending: { tokenHash: string; type: "invite" | "recovery"; area: "ops" | "client" } | null = null;
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
  const query = new URLSearchParams(window.location.search);
  const tokenHash = query.get("token_hash");
  const linkType = query.get("type");

  // トークンをアドレスバーや履歴に残さない
  if (window.location.hash || window.location.search) history.replaceState(null, "", window.location.pathname);

  // メールのリンク：ボタンが押されるまでトークンを使わない
  if (tokenHash && (linkType === "invite" || linkType === "recovery")) {
    pending = { tokenHash, type: linkType, area: query.get("area") === "client" ? "client" : "ops" };
    mode.value = "confirm";
    return;
  }

  if (linkError) {
    mode.value = "invalid";
    return;
  }
  if (accessToken && refreshToken) {
    supabase = authClient(areaOfToken(accessToken));
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) {
      mode.value = "invalid";
      return;
    }
  }
  // リンクを開き直した場合：どちらかの領域に、パスワード設定前のセッションが残っていればそれを使う
  let { data } = await supabase.auth.getSession();
  if (!data.session && !accessToken) {
    const other = authClient("client");
    const found = (await other.auth.getSession()).data;
    if (found.session) {
      supabase = other;
      data = found;
    }
  }
  mode.value = data.session ? "form" : "invalid";
});

// 「パスワードの設定に進む」：メールのトークンを確認してセッションを作る
async function proceed() {
  if (!pending) return;
  busy.value = true;
  supabase = authClient(pending.area);
  const { error } = await supabase.auth.verifyOtp({ token_hash: pending.tokenHash, type: pending.type });
  busy.value = false;
  pending = null;
  mode.value = error ? "invalid" : "form";
}

// アクセストークン（JWT）の中のメールアドレスから、領域を決める。読めなければ運営画面側
function areaOfToken(token: string): "ops" | "client" {
  try {
    const part = token.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    return roleOfLoginEmail(JSON.parse(json)?.email, nicknameDomain) === "client_admin" ? "client" : "ops";
  } catch {
    return "ops";
  }
}

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
        : "パスワードを設定できませんでした。リンクの期限が切れている可能性があります。運営管理者（または所属先の管理者）に、メールの再送を依頼してください。";
    return;
  }
  password.value = "";
  password2.value = "";
  const { data } = await supabase.auth.getSession();
  const role = roleOfLoginEmail(data.session?.user.email, nicknameDomain);
  await navigateTo(role === "client_admin" ? "/client-admin/mfa" : "/ops/mfa");
}
</script>

<template>
  <div class="auth-page">
    <main class="card">
      <h1>パスワードの設定</h1>
      <p v-if="mode === 'loading'" class="note">確認しています…</p>
      <template v-else-if="mode === 'confirm'">
        <p class="note">ダイヤル.com へようこそ。次の画面で、ログインに使うパスワードを設定します。続けて2段階認証（認証アプリ）を登録します。</p>
        <button type="button" :disabled="busy" @click="proceed">{{ busy ? "確認中…" : "パスワードの設定に進む" }}</button>
      </template>
      <template v-else-if="mode === 'invalid'">
        <p class="error">メールのリンクが無効か、有効期限が切れています。</p>
        <p class="note">リンクは1回だけ使えます。運営管理者（クライアント管理者の方は、所属先の管理者または運営）に、メールの再送を依頼してください。</p>
      </template>
      <form v-else @submit.prevent="submit">
        <p class="note">ダイヤル.com へようこそ。ログインに使うパスワードを設定してください。続けて2段階認証（認証アプリ）を登録します。</p>
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
