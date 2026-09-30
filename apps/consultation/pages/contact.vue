<script setup lang="ts">
// 運営への問い合わせ（要件 10.5）。相談（機能2）とは別であることを明示し、相談の内容は書かないよう案内する。
const category = ref("usage");
const body = ref("");
const busy = ref(false);
const sent = ref(false);
const errorMessage = ref("");

async function submit() {
  busy.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>("/api/inquiries", { method: "POST", body: { category: category.value, body: body.value } });
    sent.value = true;
    body.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="page narrow">
      <h1>運営への問い合わせ</h1>
      <div v-if="sent" class="card stack">
        <p><strong>問い合わせを受け付けました。</strong></p>
        <p class="note">運営の担当者が内容を確認します。個別のお返事はお送りできません（メールアドレスをお預かりしていないため）。</p>
        <NuxtLink class="button secondary" to="/mypage">マイページへ戻る</NuxtLink>
      </div>
      <form v-else class="card" @submit.prevent="submit">
        <p class="notice warn">
          ここは、サービスの使い方や手続きについて<strong>運営の担当者</strong>に問い合わせる窓口です。相談員は対応しません。<br />
          <strong>ご相談の内容は、ここには書かないでください。</strong>ご相談は「ご相談」の画面からお送りください。
        </p>
        <label class="field" for="cat">問い合わせの種類</label>
        <select id="cat" v-model="category">
          <option value="usage">使い方について</option>
          <option value="account">アカウントについて</option>
          <option value="deletion">記録の削除について</option>
          <option value="disclosure">記録の開示について</option>
          <option value="other">その他</option>
        </select>
        <label class="field" for="body">内容（2000文字以内）</label>
        <textarea id="body" v-model="body" rows="6" maxlength="2000" required></textarea>
        <p v-if="errorMessage" class="error" role="alert" style="margin-top: 12px">{{ errorMessage }}</p>
        <button type="submit" :disabled="busy || body.trim() === ''" style="margin-top: 16px">{{ busy ? "送信中…" : "送信する" }}</button>
      </form>
      <EmergencyLink />
    </main>
  </div>
</template>

<style scoped>
select { width: 100%; padding: 12px; font: inherit; border: 1px solid #aab3b1; border-radius: 8px; background: #fff; }
</style>
