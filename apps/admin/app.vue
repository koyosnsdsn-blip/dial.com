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
</style>
