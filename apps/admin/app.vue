<script setup lang="ts">
// lang="ja" を明示する：未指定だとブラウザによっては漢字が中国語字体で表示されるため
// robots noindex：管理画面は本番でも検索エンジンに載せない
useHead({
  htmlAttrs: { lang: "ja" },
  title: "ダイヤル.com 管理",
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
</script>

<template>
  <div class="app">
    <NuxtPage />
  </div>
</template>

<style>
:root {
  --fg: #1f2328;
  --muted: #59636e;
  --line: #d1d9e0;
  --bg: #f6f8fa;
  --accent: #0b5cad;
  --danger: #b42318;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif;
  color: var(--fg);
  background: var(--bg);
}
.app { min-height: 100vh; }
.card {
  max-width: 420px;
  margin: 64px auto;
  padding: 32px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
}
h1 { font-size: 20px; margin: 0 0 20px; }
label { display: block; font-size: 13px; margin: 14px 0 6px; color: var(--muted); }
input {
  width: 100%;
  padding: 10px 12px;
  font-size: 15px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
button {
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
button.secondary { background: #fff; color: var(--fg); border: 1px solid var(--line); }
button:disabled { opacity: 0.6; cursor: default; }
.error { margin-top: 14px; color: var(--danger); font-size: 14px; }

/* ログイン・2段階認証の画面（淡いピンク）。ボタンの #c2336a は白文字とのコントラスト比 5.3（AA 以上） */
.auth-page {
  min-height: 100vh;
  padding-top: 1px;
  background: linear-gradient(180deg, #fdf0f5 0%, #fbe4ee 100%);
}
.auth-page .card {
  border-color: #f3c6d8;
  border-top: 4px solid #e87aa3;
  box-shadow: 0 4px 16px rgba(194, 51, 106, 0.08);
}
.auth-page button:not(.secondary) { background: #c2336a; }
.auth-page button.secondary { border-color: #f3c6d8; }
.auth-page input:focus { outline: 2px solid #e87aa3; outline-offset: 1px; border-color: #e87aa3; }
.note { font-size: 13px; color: var(--muted); line-height: 1.7; }

/* 運営画面の共通部品（main に class="adm" を付けた画面で使う） */
.adm { max-width: 960px; margin: 24px auto; padding: 0 24px 48px; }
.adm.narrow { max-width: 760px; }
.adm h2 { font-size: 16px; margin: 0 0 8px; }
.adm h3 { font-size: 14px; margin: 18px 0 6px; }
.adm .panel { margin-top: 16px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.adm textarea, .adm select { width: 100%; padding: 9px 10px; font: inherit; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.adm textarea { line-height: 1.7; resize: vertical; }
.adm button { width: auto; padding: 8px 16px; }
.adm button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
.adm button.danger { background: var(--danger); }
.adm .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.adm .row > button { margin-top: 12px; }
.adm .ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; font-size: 14px; }
.adm .warn { padding: 8px 12px; background: #fff8c5; color: #7d4e00; border-radius: 6px; font-size: 14px; }
.adm .badge { display: inline-block; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); white-space: nowrap; }
.adm .badge.on { background: #dafbe1; color: #1a7f37; }
.adm .badge.alert { background: #fdecea; color: var(--danger); font-weight: 700; }
.adm .badge.wait { background: #fff8c5; color: #7d4e00; }
.adm table.grid { width: 100%; border-collapse: collapse; font-size: 14px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.adm table.grid th, .adm table.grid td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.adm table.grid th { font-size: 12px; color: var(--muted); white-space: nowrap; }
.adm .scroll { overflow-x: auto; }
.adm .pre { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }
.adm .check { display: flex; align-items: flex-start; gap: 8px; margin: 6px 0; color: var(--fg); font-size: 14px; }
.adm .check input { width: auto; margin-top: 3px; }
.adm .muted { color: var(--muted); }
.adm .tabs { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-bottom: 12px; font-size: 14px; }
.adm .tabs a { color: var(--muted); text-decoration: none; padding: 4px 0; }
.adm .tabs a.router-link-exact-active { color: var(--fg); font-weight: 600; border-bottom: 2px solid var(--accent); }
.adm .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 16px; }
</style>
