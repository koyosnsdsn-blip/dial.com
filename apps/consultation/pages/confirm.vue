<script setup lang="ts">
// メールのリンク（登録の確認・パスワード再設定）から戻ってくる画面。
// リンクに付いた認証コード（?code=...）は、Supabase のクライアントが自動でセッションに交換する。
// 登録時と別のブラウザで開いた場合は交換できないが、メールアドレスの確認自体は済んでいるので、ログインを案内する。
const supabase = useSupabaseClient();
const route = useRoute();
const state = ref<"checking" | "login">("checking");

onMounted(async () => {
  const next = route.query.next === "update-password" ? "/update-password" : "/consult";
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await navigateTo(next, { replace: true });
      return;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  state.value = "login";
});
</script>

<template>
  <main class="page narrow">
    <div class="card">
      <p v-if="state === 'checking'">確認しています…</p>
      <template v-else>
        <p><strong>メールアドレスを確認しました。</strong></p>
        <p>ログインしてご利用ください。ログインできない場合は、リンクの有効期限が切れている可能性があります。</p>
        <NuxtLink class="button" :to="{ path: '/start/email', query: { tab: 'login' } }">ログインへ</NuxtLink>
      </template>
    </div>
  </main>
</template>
