<script setup lang="ts">
// Q&A の回答待ち一覧（要件 7.4）と、処理状況（6.4.8）。
// - 投稿の古い順。SLA は投稿から3営業日。2営業日を過ぎたものを強調する
// - 投稿者は使い捨ての表示IDだけ。同じ投稿者の短期間の複数投稿は、件数のバッジだけを表示する（2.6）
type Item = { questionId: string; displayId: string | null; genre: string | null; excerpt: string; postedAt: string; businessDays: number; recentPosts: number; resubmitted: boolean };
type Queue = { genres: { genreId: string; name: string }[]; items: Item[] };
type Stats = {
  days: number;
  handled: number;
  byAction: Record<string, number>;
  byCode: Record<string, number>;
  anonymizeRate: number | null;
  staff: { name: string; handled: number; discarded: number; discardRate: number }[];
  genres: { name: string; posts: number }[];
};
const queue = ref<Queue | null>(null);
const stats = ref<Stats | null>(null);
const genre = ref("");
const loading = ref(true);
const errorMessage = ref("");

async function load() {
  try {
    queue.value = await $fetch<Queue>("/api/qa-queue", { query: genre.value ? { genre: genre.value } : {} });
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
watch(genre, load);
onMounted(async () => {
  await load();
  try {
    stats.value = await $fetch<Stats>("/api/qa-stats");
  } catch {
    /* 一覧の表示は続ける */
  }
});
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm">
      <h1>Q&amp;A</h1>
      <QaTabs />
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <label class="row">ジャンル
        <select v-model="genre" style="width: auto">
          <option value="">すべて</option>
          <option v-for="g in queue?.genres ?? []" :key="g.genreId" :value="g.genreId">{{ g.name }}</option>
        </select>
      </label>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="queue && queue.items.length === 0" class="panel note">回答待ちの投稿はありません。</p>
      <div v-else-if="queue" class="scroll">
        <table class="grid">
          <thead><tr><th>経過</th><th>投稿</th><th>ジャンル</th><th>内容（冒頭）</th><th></th></tr></thead>
          <tbody>
            <tr v-for="it in queue.items" :key="it.questionId">
              <td><span class="badge" :class="{ alert: it.businessDays >= 3, wait: it.businessDays === 2 }">{{ it.businessDays }} 営業日</span></td>
              <td>{{ formatDateTime(it.postedAt) }}<br /><span class="muted">{{ it.displayId }}</span></td>
              <td>{{ it.genre ?? "—" }}</td>
              <td>
                {{ it.excerpt }}…
                <div>
                  <span v-if="it.recentPosts >= 2" class="badge wait" title="内容が短期間に切迫していないか、確認の契機にしてください">同じ投稿者から直近30日で {{ it.recentPosts }} 件目</span>
                  <span v-if="it.resubmitted" class="badge">書き直しての再投稿</span>
                </div>
              </td>
              <td><NuxtLink :to="`/qa/${it.questionId}`">対応する</NuxtLink></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">公開または却下の目安は、投稿から3営業日以内です（土日を除いて数えています。祝日は未対応）。</p>

      <section v-if="stats" class="panel">
        <h2>処理状況（直近 {{ stats.days }} 日）</h2>
        <p class="note">
          処理した投稿 {{ stats.handled }} 件：公開 {{ stats.byAction.publish }}／却下 {{ stats.byAction.reject }}／破棄 {{ stats.byAction.discard }}／マージ {{ stats.byAction.merge }}<br />
          却下の区分：B {{ stats.byCode.B ?? 0 }}・E {{ stats.byCode.E ?? 0 }}・F {{ stats.byCode.F ?? 0 }}　破棄の区分：G1 {{ stats.byCode.G1 ?? 0 }}・G2 {{ stats.byCode.G2 ?? 0 }}・G3 {{ stats.byCode.G3 ?? 0 }}・G4 {{ stats.byCode.G4 ?? 0 }}<br />
          匿名化のための修正：{{ stats.byAction.anonymize }} 件<template v-if="stats.anonymizeRate !== null">（公開した投稿の {{ stats.anonymizeRate }}%）</template>
        </p>
        <div class="two">
          <div v-if="stats.staff.length">
            <h3>相談員別</h3>
            <table class="grid">
              <thead><tr><th>相談員</th><th>処理</th><th>破棄</th><th>破棄率</th></tr></thead>
              <tbody><tr v-for="s in stats.staff" :key="s.name"><td>{{ s.name }}</td><td>{{ s.handled }}</td><td>{{ s.discarded }}</td><td>{{ s.discardRate }}%</td></tr></tbody>
            </table>
          </div>
          <div v-if="stats.genres.length">
            <h3>ジャンル別の投稿数</h3>
            <table class="grid">
              <thead><tr><th>ジャンル</th><th>投稿</th></tr></thead>
              <tbody><tr v-for="g in stats.genres" :key="g.name"><td>{{ g.name }}</td><td>{{ g.posts }}</td></tr></tbody>
            </table>
          </div>
        </div>
        <p class="note">破棄率が特定の相談員に偏っている場合は、判断の基準（文章の質ではなく、相談する意図の有無）をそろえてください。</p>
      </section>
    </main>
  </div>
</template>
