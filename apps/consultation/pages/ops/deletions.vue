<script setup lang="ts">
// 削除依頼の状況（要件 7.13.1）。運営管理者のみ。
// 利用者が相談を削除すると、その時点で非表示になり、猶予期間の経過後に自動で完全に消去される（1日1回）。
// ここでは、消去の予定と結果を確認する。失敗したものは再実行できる。
import { apiErrorMessage, formatDateTime, shortId } from "../../ops/format";
type Row = { requestId: string; targetType: string; targetId: string; requestedAt: string; purgeAfter: string | null; executedAt: string | null; status: "pending" | "done" | "failed" };
const statusLabel: Record<string, string> = { pending: "消去待ち", done: "消去済み", failed: "失敗" };
const rows = ref<Row[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");
const busy = ref("");
const counts = computed(() => ({
  pending: rows.value.filter((r) => r.status === "pending").length,
  failed: rows.value.filter((r) => r.status === "failed").length,
}));
function daysLeft(r: Row): string {
  if (r.status !== "pending" || !r.purgeAfter) return "—";
  const d = Math.ceil((Date.parse(r.purgeAfter) - Date.now()) / 86400000);
  return d <= 0 ? "次回の実行で消去" : `あと${d}日`;
}
async function load() {
  try {
    rows.value = await $fetch<Row[]>("/api/ops/deletions");
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function retry(r: Row) {
  busy.value = r.requestId;
  message.value = "";
  try {
    const res = await $fetch<{ done: number; failed: number }>(`/api/ops/deletions/${r.requestId}/retry`, { method: "POST" });
    message.value = res.failed > 0 ? "再実行しましたが、失敗しました。" : "再実行しました。";
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = "";
  }
}
// 添付ファイルの消去（DB の行を消したあと、保管先のファイルを消す処理）。通常は1日1回、自動で実行される
const purging = ref(false);
async function purgeFiles() {
  purging.value = true;
  message.value = "";
  try {
    const res = await $fetch<{ done: number; failed: number; remaining: number }>("/api/ops/deletions/purge-files", { method: "POST" });
    message.value = `添付ファイルを ${res.done} 件消去しました（失敗 ${res.failed} 件／残り ${res.remaining} 件）。`;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    purging.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <p><NuxtLink to="/ops/menu">← 運営メニューへ戻る</NuxtLink></p>
      <h1>削除依頼の状況</h1>
      <p class="note">消去待ち {{ counts.pending }} 件／失敗 {{ counts.failed }} 件。猶予の日数は「サービス全体設定」で変更できます（変更は、変更後の削除から適用）。</p>
      <p class="note">
        相談に添付された画像は、相談の消去のあと、保管先からも消去します（1日1回、自動）。
        <button class="secondary small" type="button" :disabled="purging" @click="purgeFiles">{{ purging ? "実行中…" : "添付ファイルの消去を、いま実行する" }}</button>
      </p>
      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="rows.length === 0" class="note">削除依頼はありません。</p>
      <div v-else class="table-wrap">
        <table class="list">
          <thead><tr><th>状態</th><th>対象</th><th>削除の日時</th><th>消去の予定</th><th>残り</th><th>消去の日時</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.requestId">
              <td><span class="badge" :class="r.status">{{ statusLabel[r.status] }}</span></td>
              <td><NuxtLink v-if="r.targetType === 'case'" :to="`/ops/cases/${r.targetId}`">相談 {{ shortId(r.targetId) }}</NuxtLink><template v-else>{{ r.targetType }}</template></td>
              <td>{{ formatDateTime(r.requestedAt) }}</td>
              <td>{{ formatDateTime(r.purgeAfter) }}</td>
              <td>{{ daysLeft(r) }}</td>
              <td>{{ formatDateTime(r.executedAt) }}</td>
              <td><button v-if="r.status === 'failed'" class="secondary small" type="button" :disabled="busy !== ''" @click="retry(r)">再実行</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 960px; margin: 24px auto; padding: 0 24px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
.table-wrap { overflow-x: auto; }
table.list { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); font-size: 14px; }
.list th, .list td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
.list th { background: var(--bg); color: var(--muted); font-weight: 600; }
button.small { margin: 0; width: auto; padding: 4px 10px; font-size: 13px; }
.badge { padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); }
.badge.pending { background: #fff8c5; color: #7d4e00; }
.badge.failed { background: #fdecea; color: var(--danger); font-weight: 700; }
</style>
