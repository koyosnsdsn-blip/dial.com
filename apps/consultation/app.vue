<script setup lang="ts">
// lang="ja" を明示する：未指定だとブラウザによっては漢字が中国語字体で表示されるため
// robots noindex：開発中は検索エンジンに載せない（本番公開時に一般向けの公開ページのみ見直す）
useHead({
  htmlAttrs: { lang: "ja" },
  title: "ダイヤル.com",
  meta: [
    { name: "robots", content: "noindex, nofollow" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ],
});
</script>

<template>
  <div class="app">
    <NuxtPage />
  </div>
</template>

<style>
/* モバイルファースト（要件 11.2）。文字サイズはブラウザの設定に従うよう rem を基準にする（要件 11.6） */
:root {
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
body {
  margin: 0;
  font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif;
  color: var(--fg);
  background: var(--bg);
  line-height: 1.7;
}
.app { min-height: 100vh; }
main.page { max-width: 640px; margin: 0 auto; padding: 20px 16px 48px; }
.card {
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  margin-bottom: 16px;
}
main.narrow { max-width: 440px; }
h1 { font-size: 1.3rem; margin: 0 0 16px; line-height: 1.4; }
h2 { font-size: 1.05rem; margin: 0 0 12px; }
p { margin: 0 0 12px; }
a { color: var(--accent); }
label.field { display: block; font-size: 0.85rem; margin: 14px 0 6px; color: var(--muted); }
input[type="email"], input[type="password"], input[type="text"], textarea {
  width: 100%;
  padding: 12px;
  font: inherit;
  color: var(--fg);
  background: #fff;
  border: 1px solid #aab3b1;
  border-radius: 8px;
}
input:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible {
  outline: 3px solid #7fb9b4;
  outline-offset: 2px;
}
button, a.button {
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
button.secondary, a.button.secondary { background: var(--surface); color: var(--accent); }
button.plain { width: auto; padding: 6px 10px; font-weight: 400; background: none; border: 0; color: var(--accent); text-decoration: underline; }
button:disabled { opacity: 0.55; cursor: default; }
.stack > * + * { margin-top: 12px; }
.error { color: var(--danger); font-size: 0.9rem; }
.note { font-size: 0.85rem; color: var(--muted); }
.notice {
  padding: 12px 14px;
  font-size: 0.9rem;
  background: var(--accent-soft);
  border-radius: 8px;
}
.notice.warn { background: var(--warn-bg); border: 1px solid var(--warn-line); color: var(--warn-fg); }
</style>
