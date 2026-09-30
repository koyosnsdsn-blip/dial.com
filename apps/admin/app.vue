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
  <div>
    <h1>ダイヤル.com — 管理側アプリ</h1>
    <p>準備中</p>
  </div>
</template>
