<script setup lang="ts">
// 想定外のエラー・存在しないページのときに出す案内。Nuxt の標準のエラーページは英語で、内部の情報が出ることもあるため差し替える。
// エラーの内容（メッセージ・スタック）は画面に出さない。app.vue の外側で描画されるので、スタイルはこの中で完結させる。
import type { NuxtError } from "#app";
const props = defineProps<{ error: NuxtError }>();
const notFound = computed(() => props.error?.statusCode === 404);
useHead({ htmlAttrs: { lang: "ja" }, title: "ダイヤル.com", meta: [{ name: "robots", content: "noindex, nofollow" }] });
function back() {
  clearError({ redirect: "/" });
}
</script>

<template>
  <main class="err">
    <div class="box">
      <h1>{{ notFound ? "ページが見つかりません" : "うまく表示できませんでした" }}</h1>
      <p v-if="notFound">アドレスが違うか、ページが移動した可能性があります。</p>
      <p v-else>一時的な不具合かもしれません。時間をおいてから、もう一度お試しください。入力中の内容がある場合は、送信を確かめてからお進みください。</p>
      <button type="button" @click="back">トップへ戻る</button>
      <p class="emergency">いますぐ助けが必要なときは、<a href="/emergency">緊急時の案内</a>をご覧ください。命の危険があるときは 110（警察）・119（救急）へ。</p>
    </div>
  </main>
</template>

<style scoped>
.err { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px; box-sizing: border-box; background: #f7f5f0; color: #26302f; font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif; line-height: 1.7; }
.box { width: 100%; max-width: 440px; padding: 24px; background: #fff; border: 1px solid #d9dedc; border-radius: 12px; }
h1 { margin: 0 0 12px; font-size: 1.25rem; line-height: 1.4; }
p { margin: 0 0 12px; }
button { display: block; width: 100%; padding: 13px 16px; font: inherit; font-weight: 600; color: #fff; background: #1d6b66; border: 1px solid #1d6b66; border-radius: 8px; cursor: pointer; }
.emergency { margin: 16px 0 0; font-size: 0.85rem; color: #5c6766; }
a { color: #1d6b66; }
</style>
