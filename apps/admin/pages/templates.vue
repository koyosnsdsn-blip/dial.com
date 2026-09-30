<script setup lang="ts">
// 返信テンプレート（要件 7.15）。運営管理者のみ。相談員は、案件の返信欄から有効なテンプレートを挿入できる。
type Template = { templateId: string; title: string; body: string; sortOrder: number; active: boolean };
const rows = ref<Template[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");
const form = reactive({ templateId: "", title: "", body: "", sortOrder: 0, active: true });
const saving = ref(false);

async function load() {
  try {
    rows.value = await $fetch<Template[]>("/api/reply-templates");
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
function edit(t?: Template) {
  Object.assign(form, t ? { ...t } : { templateId: "", title: "", body: "", sortOrder: 0, active: true });
  message.value = "";
}
async function save() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>("/api/reply-templates", { method: "POST", body: { ...form, templateId: form.templateId || undefined } });
    message.value = "保存しました。";
    edit();
    await load();
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
      <p><NuxtLink to="/ops">← 運営メニューへ戻る</NuxtLink></p>
      <h1>返信テンプレート</h1>
      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="rows.length === 0" class="note">テンプレートはまだありません。</p>
      <ul class="list">
        <li v-for="t in rows" :key="t.templateId" :class="{ off: !t.active }">
          <div><strong>{{ t.title }}</strong><span v-if="!t.active" class="badge">無効</span></div>
          <p class="body">{{ t.body }}</p>
          <button class="secondary small" type="button" @click="edit(t)">変更</button>
        </li>
      </ul>

      <section class="panel">
        <h2>{{ form.templateId ? "テンプレートを変更する" : "テンプレートを追加する" }}</h2>
        <p class="note">相談員の氏名や、個人を識別する表現を含めないでください（利用者には相談員の氏名を示しません）。</p>
        <label>名前（一覧に表示）<input v-model="form.title" maxlength="100" /></label>
        <label for="t-body">本文</label>
        <textarea id="t-body" v-model="form.body" rows="6" maxlength="5000"></textarea>
        <div class="grid">
          <label>表示順<input v-model.number="form.sortOrder" type="number" min="0" max="9999" /></label>
          <label class="check"><input v-model="form.active" type="checkbox" />有効（返信欄から選べる）</label>
        </div>
        <div class="row">
          <button v-if="form.templateId" class="secondary" type="button" @click="edit()">新規の入力に戻す</button>
          <button type="button" :disabled="saving || form.title.trim() === '' || form.body.trim() === ''" @click="save">保存する</button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 760px; margin: 24px auto; padding: 0 24px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { margin-bottom: 10px; padding: 12px 16px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.list li.off { opacity: 0.6; }
.body { margin: 6px 0; font-size: 14px; white-space: pre-wrap; color: var(--muted); }
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
textarea { width: 100%; padding: 10px 12px; font: inherit; font-size: 15px; border: 1px solid var(--line); border-radius: 6px; }
.grid { display: grid; grid-template-columns: 160px 1fr; gap: 16px; align-items: end; }
.check { display: flex; align-items: center; gap: 8px; color: var(--fg); font-size: 14px; }
.check input { width: auto; }
.row { display: flex; gap: 8px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
.badge { margin-left: 8px; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); }
</style>
