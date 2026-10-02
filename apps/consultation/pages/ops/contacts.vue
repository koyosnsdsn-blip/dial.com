<script setup lang="ts">
// 公的窓口の一覧（要件 3.5・7.15）。相談員・運営管理者。相談者側の「お急ぎのとき」のページに、110・119 に続けて表示される。
// 利用者の安全に直結する情報。掲載前に、名称・電話番号・受付時間を必ず公式の情報で確かめること。
import { apiErrorMessage } from "../../ops/format";
type Contact = { contactId: string; name: string; phone: string | null; hours: string | null; note: string | null; url: string | null; sortOrder: number; active: boolean };
const rows = ref<Contact[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");
const blank = { contactId: "", name: "", phone: "", hours: "", note: "", url: "", sortOrder: 0, active: true };
const form = reactive({ ...blank });
const checked = ref(false);
const saving = ref(false);

async function load() {
  try {
    rows.value = await $fetch<Contact[]>("/api/ops/public-contacts");
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
function edit(c?: Contact) {
  Object.assign(form, c ? { ...c, phone: c.phone ?? "", hours: c.hours ?? "", note: c.note ?? "", url: c.url ?? "" } : blank);
  checked.value = false;
  message.value = "";
}
async function save() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>("/api/ops/public-contacts", { method: "POST", body: { ...form, contactId: form.contactId || undefined } });
    message.value = "保存しました。相談者側の「お急ぎのとき」のページに反映されます。";
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
      <p><NuxtLink to="/ops/menu">← 運営メニューへ戻る</NuxtLink></p>
      <h1>公的窓口の一覧</h1>
      <p class="note">相談者側の「お急ぎのとき・危険を感じるとき」のページに表示されます（警察110・救急119は常に表示）。</p>
      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="rows.length === 0" class="note">まだ登録されていません。登録するまで、相談者側には 110・119 だけが表示されます。</p>
      <ul class="list">
        <li v-for="c in rows" :key="c.contactId" :class="{ off: !c.active }">
          <strong>{{ c.name }}</strong><span v-if="!c.active" class="badge">非表示</span>
          <p class="body">{{ [c.phone, c.hours, c.note, c.url].filter(Boolean).join("／") }}</p>
          <button class="secondary small" type="button" @click="edit(c)">変更</button>
        </li>
      </ul>

      <section class="panel">
        <h2>{{ form.contactId ? "窓口を変更する" : "窓口を追加する" }}</h2>
        <div class="grid">
          <label>名称<input v-model="form.name" maxlength="100" /></label>
          <label>電話番号<input v-model="form.phone" maxlength="30" placeholder="例：0120-000-000" /></label>
          <label>受付時間<input v-model="form.hours" maxlength="100" placeholder="例：24時間・年中無休" /></label>
          <label>ウェブサイト（https://）<input v-model="form.url" maxlength="300" /></label>
          <label>表示順<input v-model.number="form.sortOrder" type="number" min="0" max="9999" /></label>
        </div>
        <label>補足（どんなときに利用できるか）<input v-model="form.note" maxlength="300" /></label>
        <label class="check"><input v-model="form.active" type="checkbox" />相談者側に表示する</label>
        <label class="check"><input v-model="checked" type="checkbox" />名称・電話番号・受付時間を、公式の情報で確認しました</label>
        <div class="row">
          <button v-if="form.contactId" class="secondary" type="button" @click="edit()">新規の入力に戻す</button>
          <button type="button" :disabled="saving || form.name.trim() === '' || !checked" @click="save">保存する</button>
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
.body { margin: 6px 0; font-size: 14px; color: var(--muted); }
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 16px; }
.check { display: flex; align-items: center; gap: 8px; margin: 10px 0 0; color: var(--fg); font-size: 14px; }
.check input { width: auto; }
.row { display: flex; gap: 8px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
.badge { margin-left: 8px; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); }
</style>
