<script setup lang="ts">
// 対応中の相談があるまま、新しい相談を始められるとき（招待コードで所属した直後など）の案内。
// 2026-10-07 入江さんの指示：切替のタイミングで残っている相談があれば、終了を案内する。
// - 強制はしない。お返事をお待ちの場合もあるため、「続ける」「終了して始める」「終了せずに始める」の3つを並べる
// - 企業会員向けの画面では、会員区分・費用に関する表示をしない（要件 8.6.1.1）。「無償」などの語は使わない
// - 終了は、本人の操作による終了（close_reason = 'user'）。相談員の完了操作とは別
const props = defineProps<{
  caseId: string;
  // home＝ご相談のホーム、start＝相談の開始画面
  where: "home" | "start";
}>();
const emit = defineEmits<{ (e: "dismiss"): void }>();

const busy = ref(false);
const errorMessage = ref("");

async function closeThen(goStart: boolean) {
  busy.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>(`/api/cases/${props.caseId}/close`, { method: "POST" });
    await loadMe();
    if (goStart && props.where === "home") await navigateTo("/consult/start");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card stack notice-open" role="region" aria-label="対応中のご相談について">
    <h2>これまでのご相談が、まだ対応中です</h2>
    <p>
      新しいご相談は、これまでのご相談とは別に始められます。2件が並行して進みます。
    </p>
    <p>
      これまでのご相談で、お話ししたいことがもう残っていなければ、終了しておくと、相談員がそれぞれのご相談に集中しやすくなります。
      お返事をお待ちのときは、終了せずに、そのままにしておいてかまいません。
    </p>
    <p class="note">終了したご相談も、履歴からいつでも読み返せます。</p>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <div class="actions">
      <button v-if="where === 'home'" type="button" :disabled="busy" @click="closeThen(true)">{{ busy ? "終了しています…" : "これまでのご相談を終了して、新しく始める" }}</button>
      <button v-else type="button" :disabled="busy" @click="closeThen(false)">{{ busy ? "終了しています…" : "これまでのご相談を終了する" }}</button>
      <NuxtLink v-if="where === 'home'" class="button secondary" to="/consult/start">終了せずに、新しく始める</NuxtLink>
      <button v-else type="button" class="secondary" :disabled="busy" @click="emit('dismiss')">終了せずに、このまま進める</button>
      <NuxtLink class="button secondary" :to="`/consult/${caseId}`">これまでのご相談を開く</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.notice-open { border-color: var(--accent); background: var(--accent-soft); }
.actions { display: flex; flex-direction: column; gap: 8px; }
</style>
