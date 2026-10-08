<script setup lang="ts">
// 通知の受信設定（要件 10.2.2）。任意の通知は、種類ごとに止められる。すべて止めることもできる。
// 【仮】通知メールの送信は、メール配信サービスが決まってから始まる。ニックネームだけで登録した方には、メールは届かない
type Settings = { showServiceName: boolean; items: { kind: string; label: string; enabled: boolean }[] };
const me = useMe();
const settings = ref<Settings | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const busy = ref(false);
const saved = ref(false);

onMounted(async () => {
  try {
    const [, s] = await Promise.all([me.value ? Promise.resolve() : loadMe(), $fetch<Settings>("/api/notification-settings")]);
    settings.value = s;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
});
async function save() {
  if (!settings.value) return;
  busy.value = true;
  saved.value = false;
  try {
    await $fetch<unknown>("/api/notification-settings", { method: "PUT", body: settings.value });
    saved.value = true;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
function stopAll() {
  settings.value?.items.forEach((i) => (i.enabled = false));
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="page">
      <p><NuxtLink to="/mypage">← マイページへ</NuxtLink></p>
      <h1>お知らせメールの設定</h1>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage && !settings" class="error" role="alert">{{ errorMessage }}</p>
      <form v-else-if="settings" class="card" @submit.prevent="save">
        <p v-if="me?.email" class="note">お知らせの送り先：<strong>{{ me.email }}</strong>（変更は <NuxtLink to="/mypage/email">メールアドレスの変更</NuxtLink> から）</p>
        <p v-if="me?.nickname" class="notice">ニックネームで登録されているため、メールアドレスが登録されていません。メールでのお知らせは届きません。新しいお返事などは、ログイン後の画面でお知らせします。<br /><NuxtLink to="/mypage/notify-email">通知用のメールアドレスを登録する</NuxtLink>（任意）</p>
        <p class="note">
          メールには、ご相談の内容は書かれません。「新しいお知らせがあります」とだけお伝えし、内容はログイン後の画面でご確認いただきます。<br />
          ご家族や職場の方にメールを見られる心配があるときは、すべて止めることができます。
        </p>
        <label v-for="it in settings.items" :key="it.kind" class="check"><input v-model="it.enabled" type="checkbox" />{{ it.label }}</label>
        <button type="button" class="plain" @click="stopAll">すべて止める</button>
        <h2>メールの件名</h2>
        <label class="check"><input v-model="settings.showServiceName" type="checkbox" />件名にサービス名（ダイヤル.com）を表示する</label>
        <p class="note">表示しない場合、件名は「新しいお知らせがあります」のようになります。</p>
        <p class="note">パスワードの再設定など、アカウントを守るために必要なメールは止められません。すべて止めた場合、新しいお返事はログイン後の画面でのみ確認できます。</p>
        <p v-if="saved" class="notice" role="status">保存しました。</p>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        <button type="submit" :disabled="busy">{{ busy ? "保存しています…" : "保存する" }}</button>
      </form>
    </main>
  </div>
</template>

<style scoped>
.check { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
.check input { width: auto; }
h2 { margin-top: 20px; }
</style>
