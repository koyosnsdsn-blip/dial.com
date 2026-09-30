<script setup lang="ts">
// ご相談のホーム（ログイン後の最初の画面）。
// 対応中の相談があればその画面へ、なければ相談の開始へ案内する。
// 企業会員向けの構成：決済・会員区分に関する表示は行わない（要件 8.6.1.1）
const me = useMe();
const loading = ref(true);
const errorMessage = ref("");

onMounted(async () => {
  try {
    await loadMe();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <AppHeader />
    <main class="page">
      <h1>ご相談</h1>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="me">
        <div v-if="me.unreadCaseId" class="card stack unread">
          <h2>相談員からお返事が届いています</h2>
          <NuxtLink class="button" :to="`/consult/${me.unreadCaseId}`">お返事を読む</NuxtLink>
        </div>
        <div v-else-if="me.openCaseId" class="card stack">
          <h2>対応中のご相談があります</h2>
          <p class="note">相談員からのお返事をお待ちください。お返事が届くと、この画面でお知らせします（メールなどでのお知らせはありません）。</p>
          <NuxtLink class="button" :to="`/consult/${me.openCaseId}`">メッセージを開く</NuxtLink>
        </div>
        <div v-else-if="me.canConsult" class="card stack">
          <h2>相談員にメッセージで相談する</h2>
          <p>はじめに、いくつかの質問（選択式）にお答えいただきます。</p>
          <NuxtLink class="button" to="/consult/start">相談をはじめる</NuxtLink>
        </div>
        <div v-else-if="!me.linked" class="card stack">
          <h2>招待コードをお持ちの方</h2>
          <p>勤務先などから案内された招待コードを登録すると、ご相談を始められます。</p>
          <NuxtLink class="button" to="/invite">招待コードを入力する</NuxtLink>
        </div>
        <div v-else class="card">
          <p>現在、新しいご相談を始めることができません。これまでのご相談は、マイページからご覧いただけます。</p>
        </div>
        <p class="note"><NuxtLink to="/mypage">これまでのご相談を見る</NuxtLink></p>
      </template>
      <EmergencyLink />
    </main>
  </div>
</template>

<style scoped>
.unread { border-color: var(--accent); border-width: 2px; background: var(--accent-soft); }
</style>
