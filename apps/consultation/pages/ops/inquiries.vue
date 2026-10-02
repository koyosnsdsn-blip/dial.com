<script setup lang="ts">
// 問い合わせ（要件 10.5）。運営管理者のみ。利用者から運営への問い合わせ（操作の質問、削除・開示の申し出など）。
// 相談（機能2）とは別。相談の内容が書かれていた場合も、ここでは相談としては扱わず、相談の窓口を案内する。
import { apiErrorMessage, formatDateTime, shortId } from "../../ops/format";
type Inquiry = { inquiryId: string; accountId: string | null; category: string; body: string; status: "open" | "done"; createdAt: string; handledAt: string | null; handledBy: string | null; note: string | null };
const categoryLabel: Record<string, string> = { usage: "使い方", account: "アカウント", deletion: "削除の申し出", disclosure: "開示の申し出", other: "その他" };
const rows = ref<Inquiry[]>([]);
const filter = ref("open");
const loading = ref(true);
const errorMessage = ref("");
const notes = reactive<Record<string, string>>({});
const busy = ref("");

async function load() {
  try {
    rows.value = await $fetch<Inquiry[]>("/api/ops/inquiries", { query: filter.value ? { status: filter.value } : {} });
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function setStatus(r: Inquiry, status: "open" | "done") {
  busy.value = r.inquiryId;
  errorMessage.value = "";
  try {
    await $fetch<unknown>(`/api/ops/inquiries/${r.inquiryId}`, { method: "PATCH", body: { status, note: notes[r.inquiryId] ?? "" } });
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = "";
  }
}
watch(filter, load);
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <p><NuxtLink to="/ops/menu">← 運営メニューへ戻る</NuxtLink></p>
      <h1>問い合わせ</h1>
      <label class="filter">表示
        <select v-model="filter">
          <option value="open">未対応</option>
          <option value="done">対応済み</option>
          <option value="">すべて</option>
        </select>
      </label>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="rows.length === 0" class="note">該当する問い合わせはありません。</p>
      <ul class="list">
        <li v-for="r in rows" :key="r.inquiryId">
          <span class="badge" :class="r.status">{{ r.status === "open" ? "未対応" : "対応済み" }}</span>
          <span class="meta">{{ categoryLabel[r.category] ?? r.category }}／{{ formatDateTime(r.createdAt) }}</span>
          <p class="body">{{ r.body }}</p>
          <p class="note">返信の手段はありません（メール配信が未設定のため）。対応した内容をメモに残してください。利用者のアカウントID：{{ r.accountId ? shortId(r.accountId) : "—" }}</p>
          <template v-if="r.status === 'open'">
            <label :for="`note-${r.inquiryId}`">対応のメモ（必須）</label>
            <input :id="`note-${r.inquiryId}`" v-model="notes[r.inquiryId]" maxlength="1000" />
            <button type="button" :disabled="busy !== '' || !(notes[r.inquiryId] ?? '').trim()" @click="setStatus(r, 'done')">対応済みにする</button>
          </template>
          <template v-else>
            <p class="handled">{{ r.handledBy ?? "—" }}・{{ formatDateTime(r.handledAt) }}：{{ r.note }}</p>
            <button class="secondary small" type="button" :disabled="busy !== ''" @click="setStatus(r, 'open')">未対応に戻す</button>
          </template>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 760px; margin: 24px auto; padding: 0 24px; }
.filter { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.filter select { width: auto; padding: 6px 8px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { margin-bottom: 10px; padding: 14px 16px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.meta { margin-left: 8px; font-size: 13px; color: var(--muted); }
.body { margin: 8px 0; font-size: 14px; white-space: pre-wrap; }
.handled { font-size: 14px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
.badge { padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); }
.badge.open { background: #fff8c5; color: #7d4e00; }
</style>
