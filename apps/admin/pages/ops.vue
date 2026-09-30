<script setup lang="ts">
// 運営メニュー。設定・マスタ・権利行使への対応など、日常の案件対応以外の画面への入口。
const staff = useStaff();
const isAdmin = computed(() => staff.value?.role === "admin");
const items = computed(() =>
  [
    { to: "/exports", title: "データ出力（CSV）", note: "案件明細・日次サマリ・アンケート", admin: false },
    { to: "/contacts", title: "公的窓口の一覧", note: "緊急時の案内ページに表示する窓口", admin: false },
    { to: "/templates", title: "返信テンプレート", note: "返信に挿入できる定型文", admin: true },
    { to: "/notices", title: "お知らせ", note: "利用者の画面上部に表示する告知", admin: true },
    { to: "/inquiries", title: "問い合わせ", note: "利用者から運営への問い合わせ", admin: true },
    { to: "/deletions", title: "削除依頼の状況", note: "利用者が削除した相談の消去状況", admin: true },
    { to: "/accounts", title: "利用者アカウントの照会", note: "ニックネーム・メールアドレスの完全一致", admin: true },
    { to: "/settings", title: "サービス全体設定", note: "自動終了までの日数などの基準値", admin: true },
  ].filter((i) => !i.admin || isAdmin.value),
);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <h1>運営メニュー</h1>
      <div class="grid">
        <NuxtLink v-for="i in items" :key="i.to" :to="i.to" class="item">
          <strong>{{ i.title }}</strong>
          <span>{{ i.note }}</span>
        </NuxtLink>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 960px; margin: 24px auto; padding: 0 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.item { display: block; padding: 16px 18px; background: #fff; border: 1px solid var(--line); border-radius: 8px; color: var(--fg); text-decoration: none; }
.item strong { display: block; color: var(--accent); }
.item span { font-size: 13px; color: var(--muted); }
</style>
