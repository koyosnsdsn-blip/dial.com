<script setup lang="ts">
// 契約クライアントの設定画面：クライアント管理者アカウント（要件 7.10.6）。運営管理者のみ。
// 招待メールを送り、本人がパスワードと2段階認証を設定すると、クライアント管理サイトを使えるようになる。
import { apiErrorMessage, formatDateTime } from "../ops/format";
type Admin = { adminId: string; name: string; email: string | null; status: "active" | "expired"; lastLoginAt: string | null };

const props = defineProps<{ clientId: string; closed: boolean }>();
const rows = ref<Admin[]>([]);
const loading = ref(true);
const busy = ref(false);
const form = reactive({ name: "", email: "", reason: "" });
const message = ref("");
const errorMessage = ref("");

async function load() {
  try {
    rows.value = await $fetch<Admin[]>(`/api/ops/clients/${props.clientId}/admins`);
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function run(fn: () => Promise<string>) {
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    const done = await fn();
    await load();
    message.value = done;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
function invite() {
  return run(async () => {
    await $fetch<unknown>(`/api/ops/clients/${props.clientId}/admins`, { method: "POST", body: { ...form } });
    Object.assign(form, { name: "", email: "", reason: "" });
    return "招待メールを送信しました。";
  });
}
function change(a: Admin, status: "active" | "expired") {
  const reason = window.prompt(status === "expired" ? `${a.name} さんのアカウントを失効させます。理由を入力してください。` : `${a.name} さんのアカウントを再び有効にします。理由を入力してください。`);
  if (!reason || reason.trim() === "") return;
  return run(async () => {
    await $fetch<unknown>(`/api/ops/clients/${props.clientId}/admins/${a.adminId}`, { method: "PATCH", body: { status, reason } });
    return status === "expired" ? "失効させました。" : "再び有効にしました。";
  });
}
onMounted(load);
</script>

<template>
  <section class="panel">
    <h2>クライアント管理者</h2>
    <p class="note">
      クライアントの担当者が、クライアント管理サイト（登録件数と四半期レポートの確認、招待コードの参照）を使うためのアカウントです。
      相談の内容や、誰が相談したかは、クライアント管理者には一切表示されません。
    </p>
    <p v-if="message" class="ok" role="status">{{ message }}</p>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <p v-if="loading" class="note">読み込み中…</p>
    <table v-else-if="rows.length">
      <thead><tr><th>氏名</th><th>メールアドレス</th><th>状態</th><th>最終利用</th><th></th></tr></thead>
      <tbody>
        <tr v-for="a in rows" :key="a.adminId">
          <td>{{ a.name }}</td>
          <td>{{ a.email ?? "—" }}</td>
          <td>{{ a.status === "active" ? "有効" : "失効" }}</td>
          <td>{{ a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "未利用" }}</td>
          <td>
            <button v-if="a.status === 'active'" class="secondary small" type="button" :disabled="busy" @click="change(a, 'expired')">失効</button>
            <button v-else-if="!closed" class="secondary small" type="button" :disabled="busy" @click="change(a, 'active')">再有効化</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="note">まだ発行されていません。</p>

    <template v-if="!closed">
      <h3>管理者を発行する</h3>
      <div class="grid">
        <label>氏名<input v-model="form.name" maxlength="100" autocomplete="off" /></label>
        <label>メールアドレス<input v-model="form.email" type="email" maxlength="254" autocomplete="off" /></label>
      </div>
      <label :for="`admin-reason-${clientId}`">理由（必須）</label>
      <input :id="`admin-reason-${clientId}`" v-model="form.reason" maxlength="500" placeholder="例：契約開始に伴う初回発行" />
      <button class="secondary" type="button" :disabled="busy || form.name.trim() === '' || form.email.trim() === '' || form.reason.trim() === ''" @click="invite">招待メールを送る</button>
      <p class="note">有効な管理者が1人だけのときは、その管理者を失効できません。先にもう1人を発行してください。</p>
    </template>
  </section>
</template>

<style scoped>
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.panel h3 { font-size: 14px; margin: 20px 0 6px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; }
th { font-size: 12px; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 16px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
</style>
