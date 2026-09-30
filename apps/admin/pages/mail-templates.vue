<script setup lang="ts">
// メールテンプレート（要件 7.14.1）。運営管理者のみ。
// 【仮】メール配信サービスが未決のため、まだ送信には使っていない。文面だけ先に管理できるようにしている
// 件名・本文に、相談の内容を示す語を入れない。本文にメッセージの内容を入れない（10.2.1）
type T = { templateId: string; key: string; subject: string; body: string; version: number; updatedAt: string };
const LABELS: Record<string, string> = {
  reply_received: "相談員からのお返事が届いたとき",
  case_closed: "ご相談が終了したとき",
  idle_close_notice: "自動終了の予告",
  qa_published: "Q&A の投稿が公開されたとき",
  qa_rejected: "Q&A の投稿が公開されなかったとき",
  reuse_request: "二次利用への同意のお願い",
  membership_ended: "所属の解除（契約終了）に伴うご案内",
};
const rows = ref<T[]>([]);
const reasons = reactive<Record<string, string>>({});
const busy = ref("");
const errorMessage = ref("");
const savedId = ref("");
async function load() {
  try {
    rows.value = await $fetch<T[]>("/api/mail-templates");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  }
}
async function save(t: T) {
  busy.value = t.templateId;
  errorMessage.value = "";
  savedId.value = "";
  try {
    await $fetch<unknown>(`/api/mail-templates/${t.templateId}`, { method: "PATCH", body: { subject: t.subject, body: t.body, reason: reasons[t.templateId] ?? "" } });
    reasons[t.templateId] = "";
    await load();
    savedId.value = t.templateId;
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
      <h1>メールテンプレート</h1>
      <p class="warn">メール配信サービスがまだ決まっていないため、これらのメールは送信されていません。文面の準備だけができます。</p>
      <p class="note">件名と本文には、相談の内容が分かる言葉を入れないでください（ご家族や職場の方の目に触れることがあるためです）。内容は、ログイン後の画面で確認してもらいます。差込項目：{ログインURL}、{表示ID}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <section v-for="t in rows" :key="t.templateId" class="panel">
        <h2>{{ LABELS[t.key] ?? t.key }}　<span class="muted">第{{ t.version }}版</span></h2>
        <label :for="`s-${t.templateId}`">件名</label>
        <input :id="`s-${t.templateId}`" v-model="t.subject" maxlength="100" />
        <label :for="`b-${t.templateId}`">本文</label>
        <textarea :id="`b-${t.templateId}`" v-model="t.body" rows="5" maxlength="3000" />
        <label :for="`r-${t.templateId}`">変更の理由（必須）</label>
        <input :id="`r-${t.templateId}`" v-model="reasons[t.templateId]" maxlength="500" />
        <button type="button" :disabled="busy !== '' || !(reasons[t.templateId] ?? '').trim()" @click="save(t)">保存する</button>
        <p v-if="savedId === t.templateId" class="ok" role="status">保存しました。</p>
        <p class="note">最終更新：{{ formatDateTime(t.updatedAt) }}。変更前の文面は、監査ログに残ります。</p>
      </section>
    </main>
  </div>
</template>
