<script setup lang="ts">
// クライアント管理サイト（要件 7.6）。契約クライアントの担当者（クライアント管理者）が使う画面。
// 暫定的に管理側アプリの中に置いている（CLAUDE.md 2章）。
//
// 見せるもの：登録件数と四半期レポート（開示用に加工済み）、従業員への案内用の招待コード、管理者アカウントの管理。
// 見せないもの：相談の内容、誰が相談したか、期間の途中の数値。これらは API にも DB の権限にも経路がない。
import type { ReportRow } from "~/components/ReportTable.vue";

type Admin = { adminId: string; name: string; email: string | null; status: "active" | "expired"; lastLoginAt: string | null; isSelf: boolean };

const me = usePortalAdmin();
const reports = ref<ReportRow[]>([]);
const admins = ref<Admin[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");
const busy = ref(false);
const form = reactive({ name: "", email: "" });
const showCode = ref(false);
const copied = ref(false);

async function load() {
  try {
    const [r, a] = await Promise.all([$fetch<ReportRow[]>("/api/portal/reports"), $fetch<Admin[]>("/api/portal/admins")]);
    reports.value = r;
    admins.value = a;
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
    admins.value = await $fetch<Admin[]>("/api/portal/admins");
    message.value = done;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
function invite() {
  return run(async () => {
    await $fetch<unknown>("/api/portal/admins", { method: "POST", body: { ...form } });
    Object.assign(form, { name: "", email: "" });
    return "招待メールを送信しました。";
  });
}
function remove(a: Admin) {
  if (!window.confirm(`${a.name} さんの管理者アカウントを削除します。よろしいですか？`)) return;
  return run(async () => {
    await $fetch<unknown>(`/api/portal/admins/${a.adminId}`, { method: "DELETE" });
    return "削除しました。";
  });
}
async function copyCode() {
  if (!me.value?.inviteCode) return;
  await navigator.clipboard.writeText(me.value.inviteCode);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
const activeAdmins = computed(() => admins.value.filter((a) => a.status === "active"));
onMounted(load);
</script>

<template>
  <div v-if="me">
    <header class="portal-header">
      <div><strong>ダイヤル.com</strong> クライアント管理サイト</div>
      <div class="who">
        <span>{{ me.clientName }}／{{ me.name }}</span>
        <button class="secondary small" type="button" @click="signOut">ログアウト</button>
      </div>
    </header>
    <main class="page">
      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="me.clientStatus === 'closed'" class="warn">契約は終了しています。過去のレポートのみ確認できます。</p>
      <p v-else-if="me.clientStatus === 'prep'" class="warn">現在、利用開始の準備中です。</p>

      <section class="panel">
        <h2>利用状況のレポート</h2>
        <p v-if="loading" class="note">読み込み中…</p>
        <ReportTable v-else-if="reports.length" :rows="reports" :contract-type="me.contractType" />
        <p v-else class="note">まだレポートはありません。レポートは四半期ごと（1月・4月・7月・10月の初め）に、直前の3か月分が追加されます。</p>
        <p class="note">ご相談の内容や、どなたが相談したかは、このサイトには表示されません。運営側からお伝えすることもありません。</p>
      </section>

      <section v-if="me.inviteCode" class="panel">
        <h2>招待コード</h2>
        <p class="note">従業員の方が登録するときに入力するコードです。社内での案内にお使いください。社外には共有しないでください。</p>
        <p class="code">
          <code>{{ showCode ? me.inviteCode : "••••••••••••••••" }}</code>
          <button class="secondary small" type="button" @click="showCode = !showCode">{{ showCode ? "隠す" : "表示" }}</button>
          <button class="secondary small" type="button" @click="copyCode">{{ copied ? "コピーしました" : "コピー" }}</button>
        </p>
        <p class="note">コードが社外に出てしまった場合は、運営までご連絡ください。新しいコードを発行します。</p>
      </section>

      <section class="panel">
        <h2>管理者アカウント</h2>
        <table v-if="admins.length">
          <thead><tr><th>氏名</th><th>メールアドレス</th><th>状態</th><th>最終利用</th><th></th></tr></thead>
          <tbody>
            <tr v-for="a in admins" :key="a.adminId">
              <td>{{ a.name }}<span v-if="a.isSelf" class="muted">（あなた）</span></td>
              <td>{{ a.email ?? "—" }}</td>
              <td>{{ a.status === "active" ? "有効" : "削除済み" }}</td>
              <td>{{ a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "未利用" }}</td>
              <td>
                <button v-if="a.status === 'active' && !a.isSelf" class="secondary small" type="button" :disabled="busy || activeAdmins.length <= 1" @click="remove(a)">削除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <template v-if="me.clientStatus !== 'closed'">
          <h3>管理者を追加する</h3>
          <div class="grid">
            <label>氏名<input v-model="form.name" maxlength="100" autocomplete="off" /></label>
            <label>メールアドレス<input v-model="form.email" type="email" maxlength="254" autocomplete="off" /></label>
          </div>
          <button type="button" :disabled="busy || form.name.trim() === '' || form.email.trim() === ''" @click="invite">招待メールを送る</button>
          <p class="note">招待された方は、メールのリンクからパスワードと2段階認証を設定すると、このサイトを使えるようになります。ご自身のアカウントは削除できません。</p>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.portal-header { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; padding: 12px 24px; background: #fff; border-bottom: 1px solid var(--line); }
.who { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.page { max-width: 860px; margin: 24px auto; padding: 0 24px; }
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.panel h3 { font-size: 14px; margin: 20px 0 6px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
.warn { padding: 8px 12px; background: #fff8c5; color: #7d4e00; border-radius: 6px; font-size: 14px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; }
th { font-size: 12px; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 16px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0 0 0 8px; padding: 4px 10px; font-size: 13px; }
.code code { font-size: 16px; padding: 4px 8px; background: var(--bg); border-radius: 4px; }
.muted { color: var(--muted); font-size: 13px; }
</style>
