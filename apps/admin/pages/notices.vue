<script setup lang="ts">
// お知らせ（要件 7.14.2）。運営管理者のみ。掲載期間と対象を指定して、利用者側の画面上部に表示する。
// 計画停止の事前告知などに使う。相談の内容や、個人を特定できる内容は書かないこと。
type Notice = { noticeId: string; body: string; target: "all" | "member" | "client" | "personal"; clientId: string | null; displayFrom: string | null; displayTo: string | null };
type ClientOption = { clientId: string; name: string };
const targetLabel: Record<string, string> = { all: "全利用者", member: "企業会員のみ", client: "特定のクライアントの所属者", personal: "個人利用者のみ" };
const rows = ref<Notice[]>([]);
const clients = ref<ClientOption[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");
const blank = { noticeId: "", body: "", target: "all", clientId: "", displayFrom: "", displayTo: "" };
const form = reactive({ ...blank });
const saving = ref(false);
const day = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) : "");
const clientName = (id: string | null) => clients.value.find((c) => c.clientId === id)?.name ?? "";
function active(n: Notice): boolean {
  const now = Date.now();
  return (!n.displayFrom || Date.parse(n.displayFrom) <= now) && (!n.displayTo || Date.parse(n.displayTo) >= now);
}

async function load() {
  try {
    [rows.value, clients.value] = await Promise.all([$fetch<Notice[]>("/api/notices"), $fetch<ClientOption[]>("/api/client-options")]);
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
function edit(n?: Notice) {
  Object.assign(form, n ? { noticeId: n.noticeId, body: n.body, target: n.target, clientId: n.clientId ?? "", displayFrom: day(n.displayFrom), displayTo: day(n.displayTo) } : blank);
  message.value = "";
}
async function save() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>("/api/notices", { method: "POST", body: { ...form, noticeId: form.noticeId || undefined } });
    message.value = "保存しました。";
    edit();
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}
async function remove(n: Notice) {
  if (!window.confirm("このお知らせを取り下げます。よろしいですか？")) return;
  try {
    await $fetch<unknown>("/api/notices", { method: "POST", body: { action: "delete", noticeId: n.noticeId } });
    message.value = "取り下げました。";
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  }
}
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <p><NuxtLink to="/ops">← 運営メニューへ戻る</NuxtLink></p>
      <h1>お知らせ</h1>
      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="rows.length === 0" class="note">お知らせはありません。</p>
      <ul class="list">
        <li v-for="n in rows" :key="n.noticeId" :class="{ off: !active(n) }">
          <span class="badge" :class="{ on: active(n) }">{{ active(n) ? "掲載中" : "掲載期間外" }}</span>
          <span class="meta">{{ targetLabel[n.target] }}<template v-if="n.target === 'client'">（{{ clientName(n.clientId) }}）</template>／{{ day(n.displayFrom) || "開始日なし" }}〜{{ day(n.displayTo) || "終了日なし" }}</span>
          <p class="body">{{ n.body }}</p>
          <button class="secondary small" type="button" @click="edit(n)">変更</button>
          <button class="secondary small" type="button" @click="remove(n)">取り下げ</button>
        </li>
      </ul>

      <section class="panel">
        <h2>{{ form.noticeId ? "お知らせを変更する" : "お知らせを追加する" }}</h2>
        <label for="n-body">本文（1000文字以内）</label>
        <textarea id="n-body" v-model="form.body" rows="4" maxlength="1000"></textarea>
        <div class="grid">
          <label>対象
            <select v-model="form.target">
              <option v-for="(label, key) in targetLabel" :key="key" :value="key">{{ label }}</option>
            </select>
          </label>
          <label v-if="form.target === 'client'">クライアント
            <select v-model="form.clientId">
              <option value="" disabled>選択してください</option>
              <option v-for="c in clients" :key="c.clientId" :value="c.clientId">{{ c.name }}</option>
            </select>
          </label>
          <label>掲載開始日<input v-model="form.displayFrom" type="date" /></label>
          <label>掲載終了日<input v-model="form.displayTo" type="date" /></label>
        </div>
        <div class="row">
          <button v-if="form.noticeId" class="secondary" type="button" @click="edit()">新規の入力に戻す</button>
          <button type="button" :disabled="saving || form.body.trim() === '' || (form.target === 'client' && !form.clientId)" @click="save">保存する</button>
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
.list li.off { opacity: 0.65; }
.meta { margin-left: 8px; font-size: 13px; color: var(--muted); }
.body { margin: 6px 0; font-size: 14px; white-space: pre-wrap; }
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
textarea { width: 100%; padding: 10px 12px; font: inherit; font-size: 15px; border: 1px solid var(--line); border-radius: 6px; }
select { width: 100%; padding: 9px 10px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 16px; }
.row { display: flex; gap: 8px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0 4px 0 0; padding: 4px 10px; font-size: 13px; }
.badge { padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); }
.badge.on { background: #dafbe1; color: #1a7f37; }
</style>
