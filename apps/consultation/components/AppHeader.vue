<script setup lang="ts">
// 共通ヘッダー。クライアントのロゴ・名称、会員区分は表示しない（要件 8.6.1.1・8.6.2）。
// 利用できない機能（契約で無効にされた機能）は、メニューに出さない（3.10.7）。
// Q&A はログインしていなくても見られるため、未ログインのときは「はじめる」への導線だけを出す
const me = useMe();
const signedIn = ref(true);
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
</style>
