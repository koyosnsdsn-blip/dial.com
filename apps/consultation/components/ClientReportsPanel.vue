<script setup lang="ts">
// 契約クライアントの設定画面：四半期レポート（要件 7.6.3）。運営管理者のみ。
// クライアント管理サイトに出ているものと同じ内容を確認でき、直前の四半期を作成・作り直しできる。
import type { ReportRow } from "./ReportTable.vue";
import { apiErrorMessage, quarterLabel } from "../ops/format";

const props = defineProps<{ clientId: string; contractType: "corp" | "muni"; prep: boolean; isTest?: boolean }>();

// テスト用のクライアントだけ、四半期を選んで作れる（期中の四半期も可。集計のロジックは自動生成と同じ）。
// 選択肢：今の四半期（期中）と、過去の4四半期。日本時間の日付で計算する
function quarterStart(offset: number): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const idx = jst.getUTCFullYear() * 4 + Math.floor(jst.getUTCMonth() / 3) - offset;
  const y = Math.floor(idx / 4);
  const m = (idx % 4) * 3 + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
const quarterOptions = computed(() =>
  [0, 1, 2, 3, 4].map((offset) => ({ value: quarterStart(offset), label: `${quarterLabel(quarterStart(offset))}${offset === 0 ? "（今の四半期・期中）" : offset === 1 ? "（直前）" : ""}` })),
);
const quarter = ref(quarterStart(0));
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
    await $fetch<unknown>(`/api/ops/clients/${props.clientId}/reports`, {
      method: "POST",
      body: props.isTest ? { reason: reason.value, quarter: quarter.value } : { reason: reason.value },
    });
    reason.value = "";
    await load();
    message.value = props.isTest ? `${quarterLabel(quarter.value)}のレポートを作成しました。` : "直前の四半期のレポートを作成しました。";
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
      <template v-if="isTest">
        <label :for="`report-quarter-${clientId}`">作成する四半期（テスト用のクライアントのみ選べます）</label>
        <select :id="`report-quarter-${clientId}`" v-model="quarter">
          <option v-for="o in quarterOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <p class="note">集計のしかたは、自動で作られるレポートと同じです。期中の四半期は、その時点までの値です（四半期が終わると、自動生成で同じ行が確定した値に置き換わります）。</p>
      </template>
      <label :for="`report-reason-${clientId}`">作成・作り直しの理由（必須）</label>
      <input :id="`report-reason-${clientId}`" v-model="reason" maxlength="500" placeholder="例：契約開始後の初回作成のため" />
      <button class="secondary" type="button" :disabled="busy || reason.trim() === ''" @click="generate">{{ busy ? "作成中…" : isTest ? "選んだ四半期のレポートを作成する" : "直前の四半期のレポートを作成する" }}</button>
    </template>
  </section>
</template>

<style scoped>
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
button { width: auto; padding: 8px 16px; }
select { display: block; width: auto; margin: 4px 0 8px; padding: 8px 10px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
</style>
