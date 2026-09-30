<script setup lang="ts">
// 開示請求への対応（要件 7.13.2）。運営管理者のみ。
// 流れ：受付（利用者アカウントの照会の画面から登録）→ 本人確認の完了を記録 → 開示用データを出力して本人へ回答 → 回答済みにする
// 開示用データには相談内容の本文が含まれる。出力は監査ログの重点監視の対象
type Row = { requestId: string; accountId: string; requestedAt: string; verifiedAt: string | null; dueAt: string | null; completedAt: string | null; note: string | null };
const rows = ref<Row[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const notes = reactive<Record<string, string>>({});
const busy = ref("");
const now = ref(Date.now());

async function load() {
  try {
    rows.value = await $fetch<Row[]>("/api/disclosures");
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
function remaining(r: Row): string {
  if (r.completedAt || !r.dueAt) return "";
  const days = Math.ceil((Date.parse(r.dueAt) - now.value) / 86400000);
  return days >= 0 ? `回答期限まで あと ${days} 日` : `回答期限を ${-days} 日 過ぎています`;
}
async function step(r: Row, action: "verify" | "complete") {
  busy.value = r.requestId;
  try {
    await $fetch<unknown>(`/api/disclosures/${r.requestId}`, { method: "PATCH", body: { action, note: notes[r.requestId] ?? "" } });
    notes[r.requestId] = "";
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = "";
  }
}
async function exportData(r: Row) {
  if (!window.confirm("開示用のデータを出力します。相談内容の本文が含まれます。出力の操作は記録されます。よろしいですか？")) return;
  busy.value = r.requestId;
  try {
    const data = await $fetch<Record<string, unknown>>(`/api/disclosures/${r.requestId}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `disclosure-${r.requestId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = "";
  }
}
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm narrow">
      <p><NuxtLink to="/ops">← 運営メニューへ戻る</NuxtLink></p>
      <h1>開示請求</h1>
      <p class="note">受付は、<NuxtLink to="/accounts">利用者アカウントの照会</NuxtLink>の画面から行います。本人確認は、ログインした状態での問い合わせ、または登録済みのメールアドレスからの連絡で行ってください。</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="rows.length === 0" class="panel note">開示請求はありません。</p>
      <section v-for="r in rows" :key="r.requestId" class="panel">
        <p>
          <span class="badge" :class="{ on: r.completedAt, wait: !r.completedAt }">{{ r.completedAt ? "回答済み" : r.verifiedAt ? "本人確認済み・回答待ち" : "本人確認待ち" }}</span>
          <span v-if="remaining(r)" class="badge" :class="{ alert: remaining(r).includes('過ぎて') }">{{ remaining(r) }}</span>
          <span class="muted">受付 {{ formatDateTime(r.requestedAt) }}／アカウント {{ shortId(r.accountId) }}</span>
        </p>
        <p v-if="r.note" class="pre note">{{ r.note }}</p>
        <template v-if="!r.completedAt">
          <label :for="`d-${r.requestId}`">{{ r.verifiedAt ? "回答の方法・日時のメモ（必須）" : "本人確認の方法のメモ（必須）" }}</label>
          <input :id="`d-${r.requestId}`" v-model="notes[r.requestId]" maxlength="1000" />
          <div class="row">
            <button v-if="!r.verifiedAt" type="button" :disabled="busy !== '' || !(notes[r.requestId] ?? '').trim()" @click="step(r, 'verify')">本人確認の完了を記録する</button>
            <template v-else>
              <button class="secondary" type="button" :disabled="busy !== ''" @click="exportData(r)">開示用データを出力する</button>
              <button type="button" :disabled="busy !== '' || !(notes[r.requestId] ?? '').trim()" @click="step(r, 'complete')">回答済みにする</button>
            </template>
          </div>
        </template>
        <p v-else class="note">回答 {{ formatDateTime(r.completedAt) }}</p>
      </section>
      <p class="note">出力したファイルには相談内容が含まれます。本人へ渡したあとは、手元に残さないでください。</p>
    </main>
  </div>
</template>
