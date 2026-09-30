<script setup lang="ts">
// lang="ja" を明示する：未指定だとブラウザによっては漢字が中国語字体で表示されるため
// robots noindex：開発中は検索エンジンに載せない（本番公開時に相談者側のみ見直す）
useHead({
  htmlAttrs: { lang: "ja" },
  title: "ダイヤル.com",
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
</script>

<template>
  <div>
    <h1>ダイヤル.com — 相談者側アプリ</h1>
    <p>準備中</p>
  </div>
</template>
