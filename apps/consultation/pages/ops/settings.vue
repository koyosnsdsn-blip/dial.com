<script setup lang="ts">
// サービス全体設定（要件 7.18）。運営管理者のみ。いずれも未決事項に関わる仮の値で、確定したらここで変更する。
import { apiErrorMessage } from "../../ops/format";
type Setting = { key: string; label: string; unit: string; def: number; min: number; max: number; note: string; value: number; isDefault: boolean; updatedAt: string | null };
const rows = ref<Setting[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");
const editing = ref("");
const form = reactive({ value: 0, reason: "" });
const saving = ref(false);

async function load() {
  try {
    rows.value = await $fetch<Setting[]>("/api/ops/settings");
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
function open(s: Setting) {
  editing.value = s.key;
  Object.assign(form, { value: s.value, reason: "" });
  message.value = "";
}
async function save(s: Setting) {
  saving.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>("/api/ops/settings", { method: "PATCH", body: { key: s.key, value: form.value, reason: form.reason } });
    editing.value = "";
    await load();
    message.value = `「${s.label}」を変更しました。`;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <p><NuxtLink to="/ops/menu">← 運営メニューへ戻る</NuxtLink></p>
      <h1>サービス全体設定</h1>
      <p class="note">すべての契約クライアント・利用者に適用されます。変更は理由とともに監査ログに記録されます。ラリー回数・返信SLAは、契約クライアントごとの設定で変更します。</p>
      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <section v-for="s in rows" :key="s.key" class="panel">
        <div class="head">
          <h2>{{ s.label }}</h2>
          <span class="value">{{ s.value }}{{ s.unit }}<span v-if="s.isDefault" class="badge">仮の既定値</span></span>
        </div>
        <p class="note">{{ s.note }}</p>
        <button v-if="editing !== s.key" class="secondary small" type="button" @click="open(s)">変更</button>
        <div v-else class="edit">
          <label>新しい値（{{ s.min }}〜{{ s.max }}{{ s.unit }}）<input v-model.number="form.value" type="number" :min="s.min" :max="s.max" /></label>
          <label>理由（必須）<input v-model="form.reason" maxlength="500" /></label>
          <div class="row">
            <button class="secondary" type="button" @click="editing = ''">やめる</button>
            <button type="button" :disabled="saving || form.reason.trim() === ''" @click="save(s)">保存する</button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 760px; margin: 24px auto; padding: 0 24px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
.panel { margin-top: 12px; padding: 14px 18px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.panel h2 { font-size: 15px; margin: 0; }
.value { font-size: 18px; font-weight: 700; white-space: nowrap; }
.badge { margin-left: 8px; padding: 2px 8px; font-size: 12px; font-weight: 400; border-radius: 10px; background: #fff8c5; color: #7d4e00; }
.row { display: flex; gap: 8px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
.edit input { max-width: 100%; }
</style>
