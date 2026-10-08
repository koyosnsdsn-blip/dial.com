<script setup lang="ts">
// サイト全体の接続元の拒否リスト（未決事項一覧 2.18）。運営管理者のみ。
// 登録した接続元からは、相談者側・運営画面・クライアント管理サイトのすべての画面とAPIを使えなくなる。
// 危険と名指しされたIPアドレス（JPCERT・警察などの公表）を登録する用途。許可リスト（その接続元からしか使えない）ではない（要件 8.6.4）。
import { apiErrorMessage, formatDateTime } from "../../ops/format";
type Rule = { ruleId: string; cidr: string; note: string | null; createdAt: string; createdBy: string | null };
const rules = ref<Rule[]>([]);
const myIp = ref<string | null>(null);
const loading = ref(true);
const busy = ref(false);
const message = ref("");
const errorMessage = ref("");
const form = reactive({ cidr: "", note: "", reason: "" });
const filter = ref("");

const shown = computed(() => {
  const q = filter.value.trim();
  return q ? rules.value.filter((r) => r.cidr.includes(q) || (r.note ?? "").includes(q)) : rules.value;
});

async function load() {
  try {
    const res = await $fetch<{ myIp: string | null; rules: Rule[] }>("/api/ops/ip-rules");
    rules.value = res.rules;
    myIp.value = res.myIp;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function add() {
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    await $fetch<unknown>("/api/ops/ip-rules", { method: "POST", body: { ...form } });
    message.value = `${form.cidr.trim()} を登録しました。反映まで最大30秒かかります。`;
    Object.assign(form, { cidr: "", note: "", reason: "" });
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function remove(r: Rule) {
  const reason = window.prompt(`${r.cidr} を拒否リストから削除します。理由を入力してください。`);
  if (!reason || reason.trim() === "") return;
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    await $fetch<unknown>(`/api/ops/ip-rules/${r.ruleId}`, { method: "DELETE", body: { reason } });
    message.value = `${r.cidr} を削除しました。`;
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <p><NuxtLink to="/ops/menu">← 運営メニューへ戻る</NuxtLink></p>
      <h1>接続元の拒否リスト</h1>
      <p class="note">
        登録したIPアドレスからは、<strong>相談者側・運営画面・クライアント管理サイトのすべて</strong>を使えなくなります。危険と名指しされた接続元（JPCERT・警察などの公表）や、攻撃が確認された接続元を登録してください。<br />
        相談者を特定の接続元に限定する設定（許可リスト）は、サービスの性質上設けていません（要件 8.6.4）。クライアント管理サイトの許可リストは、各クライアントの設定画面で行います。<br />
        変更は理由とともに監査ログに記録されます。反映まで最大30秒かかります。
      </p>
      <p class="note">いまお使いの接続元：<code>{{ myIp ?? "不明" }}</code>（これを含む値は登録できません）</p>
      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

      <section class="panel">
        <h2>追加する</h2>
        <div class="grid">
          <label>IPアドレスまたは範囲<input v-model="form.cidr" placeholder="例：198.51.100.7 または 198.51.100.0/24" autocomplete="off" /></label>
          <label>メモ（任意）<input v-model="form.note" maxlength="200" placeholder="例：JPCERT 注意喚起 2026-10-08" autocomplete="off" /></label>
        </div>
        <label for="ip-reason">理由（必須）</label>
        <input id="ip-reason" v-model="form.reason" maxlength="500" placeholder="例：注意喚起で名指しされた接続元のため" />
        <button type="button" :disabled="busy || form.cidr.trim() === '' || form.reason.trim() === ''" @click="add">拒否リストに追加</button>
      </section>

      <section class="panel">
        <h2>登録済み（{{ rules.length }}件）</h2>
        <input v-if="rules.length > 10" v-model="filter" placeholder="絞り込み（IPアドレス・メモ）" />
        <p v-if="loading" class="note">読み込み中…</p>
        <p v-else-if="rules.length === 0" class="note">登録はありません。</p>
        <table v-else>
          <thead><tr><th>IPアドレス・範囲</th><th>メモ</th><th>登録日時</th><th>登録者</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in shown" :key="r.ruleId">
              <td><code>{{ r.cidr }}</code></td>
              <td>{{ r.note ?? "" }}</td>
              <td>{{ formatDateTime(r.createdAt) }}</td>
              <td>{{ r.createdBy ?? "—" }}</td>
              <td><button class="secondary small" type="button" :disabled="busy" @click="remove(r)">削除</button></td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</template>

<style scoped>
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; }
th { font-size: 12px; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 16px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
</style>
