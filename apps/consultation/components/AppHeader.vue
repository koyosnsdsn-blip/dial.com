<script setup lang="ts">
// 共通ヘッダー。クライアントのロゴ・名称、会員区分は表示しない（要件 8.6.1.1・8.6.2）。
// 利用できない機能（契約で無効にされた機能）は、メニューに出さない（3.10.7）。
// Q&A はログインしていなくても見られるため、未ログインのときは「はじめる」への導線だけを出す
const me = useMe();
const signedIn = ref(true);
const leaving = ref(false);
// composables/useMe.ts の signOut：ログイン情報を消し、ページごと読み込み直して画面の相談内容を残さない
async function logout() {
  leaving.value = true;
  await signOut();
}
onMounted(async () => {
  const supabase = useSupabaseClient();
  const { data } = await supabase.auth.getSession();
  signedIn.value = Boolean(data.session);
  if (signedIn.value && !me.value) {
    try {
      await loadMe();
    } catch {
      // 各画面が自分でエラーを表示する
    }
  }
});
</script>

<template>
  <div>
  <header class="app-header">
    <NuxtLink :to="signedIn ? '/consult' : '/'" class="brand">ダイヤル.com</NuxtLink>
    <nav v-if="signedIn">
      <NuxtLink to="/consult">ご相談</NuxtLink>
      <NuxtLink v-if="me?.features.qa" to="/qa">Q&amp;A</NuxtLink>
      <NuxtLink v-if="me?.features.video" to="/videos">動画</NuxtLink>
      <NuxtLink to="/mypage">マイページ</NuxtLink>
      <!-- どの画面からでもログアウトできるようにする（共用の端末で相談内容を残さないため。要件 10.4） -->
      <button type="button" class="logout" :disabled="leaving" @click="logout">ログアウト</button>
    </nav>
    <nav v-else>
      <NuxtLink to="/qa">Q&amp;A</NuxtLink>
      <NuxtLink to="/">はじめる・ログイン</NuxtLink>
    </nav>
  </header>
  <NoticeBanner v-if="signedIn" />
  </div>
</template>

<style scoped>
.app-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 6px 12px;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.brand { font-weight: 700; color: var(--fg); text-decoration: none; }
nav { display: flex; gap: 16px; font-size: 14px; }
nav a { color: var(--muted); text-decoration: none; padding: 6px 0; }
nav a.router-link-active { color: var(--accent); font-weight: 600; }
nav .logout { width: auto; margin: 0; padding: 6px 0; font: inherit; font-size: 14px; color: var(--muted); background: none; border: 0; cursor: pointer; text-decoration: underline; }
nav .logout:hover { color: var(--fg); }
nav .logout:disabled { opacity: 0.6; cursor: default; }
</style>
