<script setup lang="ts">
// 【暫定】パスワード設定用のリンクを表示する（メール送信の仕組みが入るまでのつなぎ。server/ops/setupLink.ts）。
// リンクは本人になりすましてパスワードを設定できる情報なので、閉じたら画面から消す。再表示はできない（必要なら再発行する）。
const props = defineProps<{ name: string; link: string; note: string }>();
const emit = defineEmits<{ close: [] }>();
const copied = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.link);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <section class="setup-link" role="status">
    <h3>{{ name }} さんのパスワード設定用リンク</h3>
    <p class="note">
      いまはメールを送る仕組みがないため、このリンクを本人に直接渡してください。本人がリンクを開くと、パスワードの設定と2段階認証の登録に進みます。<br />
      {{ note }} 本人以外には渡さないでください。この画面を閉じると、リンクは再表示できません（必要なときは再発行してください）。
    </p>
    <div class="row">
      <input :value="link" readonly aria-label="パスワード設定用リンク" @focus="($event.target as HTMLInputElement).select()" />
      <button type="button" class="small" @click="copy">{{ copied ? "コピーしました" : "コピー" }}</button>
      <button type="button" class="secondary small" @click="emit('close')">閉じる</button>
    </div>
  </section>
</template>

<style scoped>
.setup-link { margin-top: 12px; padding: 14px 16px; background: #fff8c5; border: 1px solid #e3c96b; border-radius: 8px; }
.setup-link h3 { margin: 0 0 6px; font-size: 14px; }
.row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.row input { flex: 1; font-family: monospace; font-size: 12px; padding: 6px 8px; margin: 0; }
.row button { width: auto; margin: 0; padding: 6px 12px; font-size: 13px; }
</style>
