<script setup lang="ts">
// 通報への対応（要件 7.11.3）。記事ごとに、修正／非公開化／通報却下を選ぶ。理由の記録は必須。
// 通報した人は表示しない。通報者への結果の通知も行わない
import { apiErrorMessage, formatDateTime } from "../../ops/format";
type Item = { questionId: string; excerpt: string; unpublished: boolean; autoHidden: boolean; count: number; firstReportedAt: string; reasons: Record<string, number>; fromHeavyReporters: number };
const items = ref<Item[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const notes = reactive<Record<string, string>>({});
const busy = ref("");
async function load() {
  try {
    items.value = await $fetch<Item[]>("/api/ops/qa-reports");
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function resolve(it: Item, resolution: "fixed" | "hidden" | "dismissed") {
  busy.value = it.questionId;
  try {
    await $fetch<unknown>(`/api/ops/qa-reports/${it.questionId}`, { method: "POST", body: { resolution, note: notes[it.questionId] ?? "" } });
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = "";
  }
}
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm narrow">
      <h1>Q&amp;A</h1>
      <QaTabs />
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="items.length === 0" class="panel note">未対応の通報はありません。</p>
      <section v-for="it in items" :key="it.questionId" class="panel">
        <p>
          <span v-if="it.autoHidden" class="badge alert">通報の集中により一時非公開</span>
          <span v-else-if="it.unpublished" class="badge">非公開</span>
          <span class="badge wait">通報 {{ it.count }} 件</span>
          <span class="muted">最初の通報 {{ formatDateTime(it.firstReportedAt) }}</span>
        </p>
        <p><NuxtLink :to="`/ops/articles/${it.questionId}`" target="_blank">{{ it.excerpt }}…</NuxtLink></p>
        <p class="note">
          理由：<template v-for="(n, label) in it.reasons" :key="label">{{ label }} {{ n }} 件　</template>
          <template v-if="it.fromHeavyReporters"><br />このうち {{ it.fromHeavyReporters }} 件は、直近30日に10件以上通報している利用者によるものです（濫用の可能性）。</template>
        </p>
        <label :for="`rp-${it.questionId}`">対応の理由（必須）</label>
        <input :id="`rp-${it.questionId}`" v-model="notes[it.questionId]" maxlength="500" />
        <div class="row">
          <button class="secondary" type="button" :disabled="busy !== '' || !(notes[it.questionId] ?? '').trim()" @click="resolve(it, 'fixed')">修正した（公開を続ける）</button>
          <button class="secondary" type="button" :disabled="busy !== '' || !(notes[it.questionId] ?? '').trim()" @click="resolve(it, 'hidden')">非公開にする</button>
          <button class="secondary" type="button" :disabled="busy !== '' || !(notes[it.questionId] ?? '').trim()" @click="resolve(it, 'dismissed')">通報を却下する</button>
        </div>
        <p class="note">「修正した」は、記事の画面で内容を直したあとに選んでください。一時非公開になっていた記事は、「修正した」「通報を却下する」で再び公開されます。</p>
      </section>
    </main>
  </div>
</template>
