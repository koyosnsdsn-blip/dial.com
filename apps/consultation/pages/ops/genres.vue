<script setup lang="ts">
// ジャンルの管理（要件 7.15）。運営管理者のみ。記事があるジャンルを削除するときは、移行先を選ぶ
import { apiErrorMessage } from "../../ops/format";
type Genre = { genreId: string; name: string; sortOrder: number; questions: number };
const rows = ref<Genre[]>([]);
const newName = ref("");
const moveTo = reactive<Record<string, string>>({});
const busy = ref(false);
const errorMessage = ref("");
async function load() {
  try {
    rows.value = await $fetch<Genre[]>("/api/ops/genres");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  }
}
async function run(fn: () => Promise<unknown>) {
  busy.value = true;
  errorMessage.value = "";
  try {
    await fn();
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
const add = () => run(async () => { await $fetch<unknown>("/api/ops/genres", { method: "POST", body: { name: newName.value } }); newName.value = ""; });
const rename = (g: Genre) => run(() => $fetch<unknown>(`/api/ops/genres/${g.genreId}`, { method: "PATCH", body: { name: g.name } }));
function move(i: number, delta: number) {
  const next = [...rows.value];
  const j = i + delta;
  if (!next[i] || !next[j]) return;
  [next[i], next[j]] = [next[j], next[i]];
  // 並び順を 1 から振り直し、変わったものだけ保存する
  return run(async () => {
    for (const [index, g] of next.entries()) {
      if (g.sortOrder !== index + 1) await $fetch<unknown>(`/api/ops/genres/${g.genreId}`, { method: "PATCH", body: { sortOrder: index + 1 } });
    }
  });
}
function remove(g: Genre) {
  if (!window.confirm(g.questions ? `「${g.name}」を削除し、記事 ${g.questions} 件を移行先のジャンルへ移します。よろしいですか？` : `「${g.name}」を削除します。よろしいですか？`)) return;
  return run(() => $fetch<unknown>(`/api/ops/genres/${g.genreId}`, { method: "DELETE", query: g.questions ? { moveTo: moveTo[g.genreId] } : {} }));
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
      <table class="grid">
        <thead><tr><th>順</th><th>名前</th><th>記事</th><th>削除</th></tr></thead>
        <tbody>
          <tr v-for="(g, i) in rows" :key="g.genreId">
            <td class="row">
              <button class="secondary small" type="button" :disabled="busy || i === 0" :aria-label="`${g.name} を上へ`" @click="move(i, -1)">↑</button>
              <button class="secondary small" type="button" :disabled="busy || i === rows.length - 1" :aria-label="`${g.name} を下へ`" @click="move(i, 1)">↓</button>
            </td>
            <td class="row"><input v-model="g.name" maxlength="50" style="width: 220px" :aria-label="`ジャンル名`" /><button class="secondary small" type="button" :disabled="busy || g.name.trim() === ''" @click="rename(g)">改名</button></td>
            <td>{{ g.questions }} 件</td>
            <td>
              <select v-if="g.questions" v-model="moveTo[g.genreId]" style="width: 160px" aria-label="記事の移行先">
                <option :value="undefined" disabled>移行先を選ぶ</option>
                <option v-for="o in rows.filter((x) => x.genreId !== g.genreId)" :key="o.genreId" :value="o.genreId">{{ o.name }}</option>
              </select>
              <button class="secondary small" type="button" :disabled="busy || (g.questions > 0 && !moveTo[g.genreId])" @click="remove(g)">削除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <section class="panel">
        <h2>ジャンルを追加する</h2>
        <div class="row">
          <input v-model="newName" maxlength="50" style="width: 260px" aria-label="新しいジャンルの名前" />
          <button type="button" style="margin-top: 0" :disabled="busy || newName.trim() === ''" @click="add">追加する</button>
        </div>
      </section>
    </main>
  </div>
</template>
