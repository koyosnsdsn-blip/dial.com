<script setup lang="ts">
// 1つのホストで、相談者側（/…）と運営画面（/ops/…・/client-admin/…）を出し分ける。
// 2026-10-02 まで別アプリ（apps/admin）だった運営画面を、脆弱性診断の対象（FQDN）を1つにするためにまとめた。
// 見た目の共通スタイルは、それぞれの外枠（.user-root／.ops-root）の内側にだけ効かせる。
// :where() で包んでいるのは、各画面の scoped スタイルより優先度が上がらないようにするため（まとめる前と同じ優先度）。
//
// lang="ja" を明示する：未指定だとブラウザによっては漢字が中国語字体で表示されるため
// robots noindex：開発中は検索エンジンに載せない（本番公開時に一般向けの公開ページのみ見直す）。運営画面は本番でも載せない
const route = useRoute();
const isOps = computed(() => /^\/(ops|client-admin)(\/|$)/.test(route.path));
useHead({
  htmlAttrs: { lang: "ja" },
  title: () => (isOps.value ? "ダイヤル.com 管理" : "ダイヤル.com"),
  meta: [
    { name: "robots", content: "noindex, nofollow" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ],
});
</script>

<template>
  <div :class="isOps ? 'ops-root' : 'user-root'">
    <NuxtPage />
  </div>
</template>

<style>
body { margin: 0; }

/* ===== 相談者側 ===== */
/* モバイルファースト（要件 11.2）。文字サイズはブラウザの設定に従うよう rem を基準にする（要件 11.6） */
.user-root {
  --fg: #26302f;
  --muted: #5c6766;
  --line: #d9dedc;
  --bg: #f7f5f0;
  --surface: #ffffff;
  --accent: #1d6b66;      /* 白文字とのコントラスト比 6.1 */
  --accent-soft: #e4f1ef;
  --danger: #b42318;
  --warn-bg: #fff6e5;
  --warn-line: #f0d9a8;
  --warn-fg: #7a4a00;
}
* { box-sizing: border-box; }
html { font-size: 100%; }
.user-root {
    font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif;
  color: var(--fg);
  background: var(--bg);
  line-height: 1.7;
}
.user-root { min-height: 100vh; }
:where(.user-root) main.page { max-width: 640px; margin: 0 auto; padding: 20px 16px 48px; }
:where(.user-root) .card {
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 16px;
}
:where(.user-root) main.narrow { max-width: 440px; }
:where(.user-root) h1 { font-size: 1.3rem; margin: 0 0 16px; line-height: 1.4; }
:where(.user-root) h2 { font-size: 1.05rem; margin: 0 0 12px; }
:where(.user-root) p { margin: 0 0 12px; }
:where(.user-root) a { color: var(--accent); }
:where(.user-root) label.field { display: block; font-size: 0.85rem; margin: 14px 0 6px; color: var(--muted); }
:where(.user-root) input[type="email"], :where(.user-root) input[type="password"], :where(.user-root) input[type="text"], :where(.user-root) textarea {
  width: 100%;
  padding: 12px;
  font: inherit;
  color: var(--fg);
  background: #fff;
  border: 1px solid #aab3b1;
  border-radius: 8px;
}
:where(.user-root) input:focus-visible, :where(.user-root) textarea:focus-visible, :where(.user-root) button:focus-visible, :where(.user-root) a:focus-visible {
  outline: 3px solid #7fb9b4;
  outline-offset: 2px;
}
:where(.user-root) button, :where(.user-root) a.button {
  display: inline-block;
  width: 100%;
  padding: 13px 16px;
  font: inherit;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  color: #fff;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 8px;
  cursor: pointer;
}
:where(.user-root) button.secondary, :where(.user-root) a.button.secondary { background: var(--surface); color: var(--accent); }
:where(.user-root) button.plain { width: auto; padding: 6px 10px; font-weight: 400; background: none; border: 0; color: var(--accent); text-decoration: underline; }
:where(.user-root) button:disabled { opacity: 0.55; cursor: default; }
:where(.user-root) .stack > * + * { margin-top: 12px; }
:where(.user-root) .error { color: var(--danger); font-size: 0.9rem; }
:where(.user-root) .note { font-size: 0.85rem; color: var(--muted); }
:where(.user-root) .notice {
  padding: 12px 14px;
  font-size: 0.9rem;
  background: var(--accent-soft);
  border-radius: 8px;
}
:where(.user-root) .notice.warn { background: var(--warn-bg); border: 1px solid var(--warn-line); color: var(--warn-fg); }

/* ===== 運営画面・クライアント管理サイト ===== */
.ops-root {
  --fg: #1f2328;
  --muted: #59636e;
  --line: #d1d9e0;
  --bg: #f6f8fa;
  --accent: #0b5cad;
  --danger: #b42318;
}
* { box-sizing: border-box; }
.ops-root {
    font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif;
  color: var(--fg);
  background: var(--bg);
}
.ops-root { min-height: 100vh; }
:where(.ops-root) .card {
  max-width: 420px;
  margin: 64px auto;
  padding: 32px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
}
:where(.ops-root) h1 { font-size: 20px; margin: 0 0 20px; }
:where(.ops-root) label { display: block; font-size: 13px; margin: 14px 0 6px; color: var(--muted); }
:where(.ops-root) input {
  width: 100%;
  padding: 10px 12px;
  font-size: 15px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
:where(.ops-root) button {
  margin-top: 20px;
  width: 100%;
  padding: 10px 12px;
  font-size: 15px;
  color: #fff;
  background: var(--accent);
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
:where(.ops-root) button.secondary { background: #fff; color: var(--fg); border: 1px solid var(--line); }
:where(.ops-root) button:disabled { opacity: 0.6; cursor: default; }
:where(.ops-root) .error { margin-top: 14px; color: var(--danger); font-size: 14px; }
/* ログイン・2段階認証の画面（淡いピンク）。ボタンの #c2336a は白文字とのコントラスト比 5.3（AA 以上） */
:where(.ops-root) .auth-page {
  min-height: 100vh;
  padding-top: 1px;
  background: linear-gradient(180deg, #fdf0f5 0%, #fbe4ee 100%);
}
:where(.ops-root) .auth-page .card {
  border-color: #f3c6d8;
  border-top: 4px solid #e87aa3;
  box-shadow: 0 4px 16px rgba(194, 51, 106, 0.08);
}
:where(.ops-root) .auth-page button:not(.secondary) { background: #c2336a; }
:where(.ops-root) .auth-page button.secondary { border-color: #f3c6d8; }
:where(.ops-root) .auth-page input:focus { outline: 2px solid #e87aa3; outline-offset: 1px; border-color: #e87aa3; }
:where(.ops-root) .note { font-size: 13px; color: var(--muted); line-height: 1.7; }
/* 運営画面の共通部品（main に class="adm" を付けた画面で使う） */
:where(.ops-root) .adm { max-width: 960px; margin: 24px auto; padding: 0 24px 48px; }
:where(.ops-root) .adm.narrow { max-width: 760px; }
:where(.ops-root) .adm h2 { font-size: 16px; margin: 0 0 8px; }
:where(.ops-root) .adm h3 { font-size: 14px; margin: 18px 0 6px; }
:where(.ops-root) .adm .panel { margin-top: 16px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
:where(.ops-root) .adm textarea, :where(.ops-root) .adm select { width: 100%; padding: 9px 10px; font: inherit; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
:where(.ops-root) .adm textarea { line-height: 1.7; resize: vertical; }
:where(.ops-root) .adm button { width: auto; padding: 8px 16px; }
:where(.ops-root) .adm button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
:where(.ops-root) .adm button.danger { background: var(--danger); }
:where(.ops-root) .adm .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
:where(.ops-root) .adm .row > button { margin-top: 12px; }
:where(.ops-root) .adm .ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; font-size: 14px; }
:where(.ops-root) .adm .warn { padding: 8px 12px; background: #fff8c5; color: #7d4e00; border-radius: 6px; font-size: 14px; }
:where(.ops-root) .adm .badge { display: inline-block; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); white-space: nowrap; }
:where(.ops-root) .adm .badge.on { background: #dafbe1; color: #1a7f37; }
:where(.ops-root) .adm .badge.alert { background: #fdecea; color: var(--danger); font-weight: 700; }
:where(.ops-root) .adm .badge.wait { background: #fff8c5; color: #7d4e00; }
:where(.ops-root) .adm table.grid { width: 100%; border-collapse: collapse; font-size: 14px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
:where(.ops-root) .adm table.grid th, :where(.ops-root) .adm table.grid td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
:where(.ops-root) .adm table.grid th { font-size: 12px; color: var(--muted); white-space: nowrap; }
:where(.ops-root) .adm .scroll { overflow-x: auto; }
:where(.ops-root) .adm .pre { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }
:where(.ops-root) .adm .check { display: flex; align-items: flex-start; gap: 8px; margin: 6px 0; color: var(--fg); font-size: 14px; }
:where(.ops-root) .adm .check input { width: auto; margin-top: 3px; }
:where(.ops-root) .adm .muted { color: var(--muted); }
:where(.ops-root) .adm .tabs { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-bottom: 12px; font-size: 14px; }
:where(.ops-root) .adm .tabs a { color: var(--muted); text-decoration: none; padding: 4px 0; }
:where(.ops-root) .adm .tabs a.router-link-exact-active { color: var(--fg); font-weight: 600; border-bottom: 2px solid var(--accent); }
:where(.ops-root) .adm .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 16px; }
</style>
