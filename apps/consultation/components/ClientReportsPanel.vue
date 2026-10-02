<script setup lang="ts">
// 契約クライアントの設定画面：四半期レポート（要件 7.6.3）。運営管理者のみ。
// クライアント管理サイトに出ているものと同じ内容を確認でき、直前の四半期を作成・作り直しできる。
import type { ReportRow } from "./ReportTable.vue";
import { apiErrorMessage } from "../ops/format";

const props = defineProps<{ clientId: string; contractType: "corp" | "muni"; prep: boolean }>();
const rows = ref<ReportRow[]>([]);
const loading = ref(true);
const busy = ref(false);
const reason = ref("");
const message = ref("");
const errorMessage = ref("");

async function load() {
  try {
    rows.value = await $fetch<ReportRow[]>(`/api/ops/clients/${props.clientId}/reports`);
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function generate() {
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    await $fetch<unknown>(`/api/ops/clients/${props.clientId}/reports`, { method: "POST", body: { reason: reason.value } });
    reason.value = "";
    await load();
    message.value = "直前の四半期のレポートを作成しました。";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <section class="panel">
    <h2>四半期レポート</h2>
    <p class="note">クライアント管理サイトに表示される内容です。四半期の初日に、直前の四半期の分が自動で作られます。</p>
    <p v-if="message" class="ok" role="status">{{ message }}</p>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <p v-if="loading" class="note">読み込み中…</p>
    <ReportTable v-else-if="rows.length" :rows="rows" :contract-type="contractType" />
    <p v-else class="note">まだレポートはありません。</p>
    <template v-if="!prep">
      <label :for="`report-reason-${clientId}`">作成・作り直しの理由（必須）</label>
      <input :id="`report-reason-${clientId}`" v-model="reason" maxlength="500" placeholder="例：契約開始後の初回作成のため" />
      <button class="secondary" type="button" :disabled="busy || reason.trim() === ''" @click="generate">{{ busy ? "作成中…" : "直前の四半期のレポートを作成する" }}</button>
    </template>
  </section>
</template>

<style scoped>
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
button { width: auto; padding: 8px 16px; }
</style>
