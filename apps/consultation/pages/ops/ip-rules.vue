<script setup lang="ts">
// サイト全体の接続元の拒否リスト（未決事項一覧 2.18）。運営管理者のみ。
// 登録した接続元からは、相談者側・運営画面・クライアント管理サイトのすべての画面とAPIを使えなくなる。
// 危険と名指しされたIPアドレス（JPCERT・警察などの公表）を登録する用途。許可リスト（その接続元からしか使えない）ではない（要件 8.6.4）。
import { apiErrorMessage, formatDateTime } from "../../ops/format";
import { cidrContains, parseCidr, parseIp, splitIpList } from "../../utils/ipCidr";
type Rule = { ruleId: string; cidr: string; note: string | null; createdAt: string; createdBy: string | null };
const rules = ref<Rule[]>([]);
const myIp = ref<string | null>(null);
const loading = ref(true);
const busy = ref(false);
const message = ref("");
const errorMessage = ref("");
const form = reactive({ cidrText: "", note: "", reason: "" });
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
// 貼り付けた値を1件ずつに分け、送る前に確かめる（誤りがあれば、どの値かを示す）
const items = computed(() =>
  splitIpList(form.cidrText).map((raw) => {
    const c = parseCidr(raw);
    let problem = "";
    if (!c) problem = "形式が正しくありません";
    else if ((c.v === 4 && c.prefix < 8) || (c.v === 6 && c.prefix < 16)) problem = "範囲が広すぎます";
    else {
      const me = myIp.value ? parseIp(myIp.value) : null;
      if (me && cidrContains(c, me)) problem = "いまお使いの接続元が含まれています";
    }
    return { raw, text: c?.text ?? "", problem };
  }),
);
const problems = computed(() => items.value.filter((i) => i.problem !== ""));
const tooMany = computed(() => items.value.length > 50);

async function add() {
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    const res = await $fetch<{ added: string[]; skipped: string[] }>("/api/ops/ip-rules", {
      method: "POST",
      body: { cidrs: items.value.map((i) => i.raw), note: form.note, reason: form.reason },
    });
    message.value =
      `${res.added.length}件を登録しました。反映まで最大30秒かかります。` +
      (res.skipped.length > 0 ? `（すでに登録済みのため読み飛ばし：${res.skipped.join("、")}）` : "");
    Object.assign(form, { cidrText: "", note: "", reason: "" });
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
        <label for="ip-list">IPアドレスまたは範囲（複数まとめて貼り付けできます）</label>
        <textarea id="ip-list" v-model="form.cidrText" rows="6" autocomplete="off" spellcheck="false"
          placeholder="例：&#10;198.51.100.7&#10;198.51.100.0/24&#10;203[.]0[.]113[.]5" />
        <p class="note">区切りは、改行・カンマ・スペースのどれでも構いません。一度に50件までです。注意喚起の文書にある <code>203[.]0[.]113[.]5</code> の書き方も、そのまま貼れます。範囲で指定する場合は、末尾を0にしてください（192.168.1.0/24）。</p>
        <p v-if="items.length > 0 && problems.length === 0 && !tooMany" class="note">{{ items.length }}件を登録します：<code>{{ items.map((i) => i.text).join("、") }}</code></p>
        <ul v-if="problems.length > 0" class="error" role="alert">
          <li v-for="i in problems" :key="i.raw"><code>{{ i.raw }}</code>：{{ i.problem }}</li>
        </ul>
        <p v-if="tooMany" class="error" role="alert">一度に登録できるのは50件までです（いま{{ items.length }}件）。分けて登録してください。</p>
        <div class="grid">
          <label>メモ（任意。すべての値に付きます）<input v-model="form.note" maxlength="200" placeholder="例：JPCERT 注意喚起 2026-10-08" autocomplete="off" /></label>
        </div>
        <label for="ip-reason">理由（必須）</label>
        <input id="ip-reason" v-model="form.reason" maxlength="500" placeholder="例：注意喚起で名指しされた接続元のため" />
        <button type="button" :disabled="busy || items.length === 0 || problems.length > 0 || tooMany || form.reason.trim() === ''" @click="add">{{ items.length > 1 ? `${items.length}件を拒否リストに追加` : "拒否リストに追加" }}</button>
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
textarea { width: 100%; font-family: ui-monospace, monospace; font-size: 14px; padding: 8px; border: 1px solid var(--line); border-radius: 6px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 16px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
</style>
