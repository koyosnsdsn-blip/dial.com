<script setup lang="ts">
// 画面・メッセージ内の自動文面（要件 7.14.3）。運営管理者のみ。
// - 全体の既定の文面と、クライアント別の上書きを編集できる
// - 緊急時の案内・開示範囲の説明は、ここには出てこない（全社共通・固定。クライアントごとに変えられない）
// - 受付の自動応答は {返信までの時間} が必須で、固定の時間（「24時間」など）は書けない
import { apiErrorMessage } from "../../ops/format";
type Item = { key: string; label: string; vars: string[]; builtin: string; override: string | null; inherited: string; updatedAt: string | null };
type Client = { clientId: string; name: string };
const clients = ref<Client[]>([]);
const clientId = ref("");
const items = ref<Item[]>([]);
const drafts = reactive<Record<string, string>>({});
const reasons = reactive<Record<string, string>>({});
const busy = ref("");
const errorMessage = ref("");
const savedKey = ref("");

async function load() {
  try {
    items.value = await $fetch<Item[]>("/api/ops/auto-texts", { query: clientId.value ? { clientId: clientId.value } : {} });
    for (const it of items.value) drafts[it.key] = it.override ?? "";
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  }
}
async function save(it: Item, clear = false) {
  busy.value = it.key;
  savedKey.value = "";
  errorMessage.value = "";
  try {
    await $fetch<unknown>("/api/ops/auto-texts", { method: "PUT", body: { key: it.key, clientId: clientId.value || undefined, body: clear ? "" : drafts[it.key], reason: reasons[it.key] ?? "" } });
    reasons[it.key] = "";
    await load();
    savedKey.value = it.key;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = "";
  }
}
const varTag = (name: string) => "{" + name + "}";
watch(clientId, load);
onMounted(async () => {
  try {
    clients.value = await $fetch<Client[]>("/api/ops/client-options");
  } catch {
    clients.value = [];
  }
  await load();
});
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm narrow">
      <p><NuxtLink to="/ops/menu">← 運営メニューへ戻る</NuxtLink></p>
      <h1>自動文面</h1>
      <p class="note">相談の画面に、相談員の発言とは別の形で表示される案内です。緊急時の案内と、勤務先・委託元へ伝わる情報の説明は、全社共通の固定の文面のため、ここでは変えられません。</p>
      <label for="at-client">編集する対象</label>
      <select id="at-client" v-model="clientId">
        <option value="">全体の既定</option>
        <option v-for="c in clients" :key="c.clientId" :value="c.clientId">{{ c.name }} だけの上書き</option>
      </select>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <section v-for="it in items" :key="it.key" class="panel">
        <h2>{{ it.label }} <span v-if="it.override !== null" class="badge wait">上書き中</span></h2>
        <p class="note">上書きしない場合の文面：<br /><span class="pre">{{ it.inherited }}</span></p>
        <label :for="`t-${it.key}`">上書きする文面（500文字まで）<template v-if="it.vars.length">　差込項目：<code v-for="v in it.vars" :key="v">{{ varTag(v) }}</code>（必須）</template></label>
        <textarea :id="`t-${it.key}`" v-model="drafts[it.key]" rows="3" maxlength="500" />
        <label :for="`r-${it.key}`">変更の理由（必須）</label>
        <input :id="`r-${it.key}`" v-model="reasons[it.key]" maxlength="500" />
        <div class="row">
          <button type="button" :disabled="busy !== '' || !(drafts[it.key] ?? '').trim() || !(reasons[it.key] ?? '').trim()" @click="save(it)">この文面で上書きする</button>
          <button v-if="it.override !== null" class="secondary" type="button" :disabled="busy !== '' || !(reasons[it.key] ?? '').trim()" @click="save(it, true)">上書きをやめる</button>
        </div>
        <p v-if="savedKey === it.key" class="ok" role="status">保存しました。利用者の画面には、次に開いたときから反映されます。</p>
      </section>
    </main>
  </div>
</template>
