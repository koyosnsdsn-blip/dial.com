<script setup lang="ts">
// 運営メニュー。設定・マスタ・権利行使への対応など、日常の案件対応以外の画面への入口。
import { useStaff } from "../../ops/useStaff";
const staff = useStaff();
const isAdmin = computed(() => staff.value?.role === "admin");
const items = computed(() =>
  [
    { to: "/ops/exports", title: "データ出力（CSV）", note: "案件明細・日次サマリ・アンケート", admin: false },
    { to: "/ops/contacts", title: "公的窓口の一覧", note: "緊急時の案内ページに表示する窓口", admin: false },
    { to: "/ops/qa", title: "Q&A", note: "回答待ちの投稿、公開済みの記事、通報、ジャンル", admin: false },
    { to: "/ops/videos", title: "動画", note: "動画の登録と配信範囲の設定", admin: true },
    { to: "/ops/templates", title: "返信テンプレート", note: "返信に挿入できる定型文", admin: true },
    { to: "/ops/auto-texts", title: "自動文面", note: "相談の画面に表示される案内の文面", admin: true },
    { to: "/ops/mail-templates", title: "メールテンプレート", note: "通知メールの件名と本文（送信は未開始）", admin: true },
    { to: "/ops/notices", title: "お知らせ", note: "利用者の画面上部に表示する告知", admin: true },
    { to: "/ops/inquiries", title: "問い合わせ", note: "利用者から運営への問い合わせ", admin: true },
    { to: "/ops/deletions", title: "削除依頼の状況", note: "利用者が削除した相談の消去状況", admin: true },
    { to: "/ops/disclosures", title: "開示請求", note: "保有個人データの開示請求への対応", admin: true },
    { to: "/ops/reuse-consents", title: "二次利用同意", note: "相談内容を記事にするための同意の状況", admin: true },
    { to: "/ops/accounts", title: "利用者アカウントの照会", note: "ニックネーム・メールアドレスの完全一致", admin: true },
    { to: "/ops/ip-rules", title: "接続元の拒否リスト", note: "危険と名指しされたIPアドレスからのアクセスを拒否する", admin: true },
    { to: "/ops/settings", title: "サービス全体設定", note: "自動終了までの日数などの基準値", admin: true },
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
