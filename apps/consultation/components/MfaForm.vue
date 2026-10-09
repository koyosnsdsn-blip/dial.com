<script setup lang="ts">
// 多要素認証（2段階目）。要件 8.8.2：運営側は必須・例外なし。
// - 認証アプリが未登録 → QRコードを表示して登録（初回のみ）
// - 登録済み → 6桁コードを入力
// どちらも成功するとセッションが aal2 に上がり、管理画面を開けるようになる。
// 運営画面（/ops/mfa）とクライアント管理サイト（/client-admin/mfa）で共通。ログイン画面と同じく、役割ごとにページを分けている。
import { authClient } from "../ops/authClient";
import { signOut } from "../ops/useStaff";

const props = defineProps<{ area: "ops" | "client_admin" }>();
const isOps = props.area === "ops";
const supabase = authClient(isOps ? "ops" : "client");

type Mode = "loading" | "enroll" | "verify" | "failed";
const mode = ref<Mode>("loading");
const factorId = ref("");
const qrCode = ref("");
const secret = ref("");
const code = ref("");
const busy = ref(false);
const errorMessage = ref("");

onMounted(async () => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) {
    mode.value = "failed";
    return;
  }

  const verified = data.all.find((f) => f.factor_type === "totp" && f.status === "verified");
  if (verified) {
    factorId.value = verified.id;
    mode.value = "verify";
    return;
  }

  // 前回の登録が途中で終わっていた場合の残骸（未確認の要素）を消してからやり直す
  for (const f of data.all) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: isOps ? "ダイヤル.com 管理" : "ダイヤル.com クライアント管理",
    friendlyName: `認証アプリ ${new Date().toISOString()}`,
  });
  if (enrollError || !enrolled) {
    mode.value = "failed";
    return;
  }
  factorId.value = enrolled.id;
  qrCode.value = enrolled.totp.qr_code;
  secret.value = enrolled.totp.secret;
  mode.value = "enroll";
});

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factorId.value,
    code: code.value.trim(),
  });
  busy.value = false;

  if (error) {
    errorMessage.value =
      error.status === 429
        ? "試行回数が上限に達しました。しばらく時間をおいてから再度お試しください。"
        : "コードが正しくありません。認証アプリに表示されている最新の6桁を入力してください。";
    code.value = "";
    return;
  }
  code.value = "";
  // 運営画面は /ops へ進む（先生の場合は、ガードが /ops/expert へ振り分ける）
  await navigateTo(isOps ? "/ops" : "/client-admin");
}
</script>

<template>
  <div class="auth-page">
  <main class="card">
    <h1>2段階認証</h1>

    <p v-if="mode === 'loading'" class="note">確認しています…</p>

    <p v-else-if="mode === 'failed'" class="error">
      2段階認証の準備に失敗しました。時間をおいて再度ログインしてください。
    </p>

    <template v-else>
      <template v-if="mode === 'enroll'">
        <p class="note">
          {{ isOps ? "管理画面" : "クライアント管理サイト" }}の利用には2段階認証の登録が必要です（初回のみ）。<br />
          認証アプリ（Google Authenticator、Microsoft Authenticator 等）で下のQRコードを読み取り、表示された6桁のコードを入力してください。
        </p>
        <img :src="qrCode" alt="認証アプリ登録用のQRコード" width="200" height="200" style="display: block; margin: 12px auto" />
        <p class="note">QRコードを読み取れない場合は、次の文字列を手入力してください：<br /><code style="word-break: break-all">{{ secret }}</code></p>
      </template>
      <p v-else class="note">認証アプリに表示されている6桁のコードを入力してください。</p>

      <form @submit.prevent="submit">
        <label for="code">6桁のコード</label>
        <input
          id="code"
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          required
        />
        <button type="submit" :disabled="busy">{{ busy ? "確認中…" : mode === "enroll" ? "登録して続ける" : "確認" }}</button>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      </form>
    </template>

    <button class="secondary" type="button" @click="signOut">別のアカウントでログインする</button>
  </main>
  </div>
</template>
