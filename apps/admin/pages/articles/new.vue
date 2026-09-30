<script setup lang="ts">
// 記事の直接作成（要件 7.11.1）。初期アーカイブなど、利用者の投稿を経由しない記事。
// 過去の相談を素材にする場合は、二次利用の同意が済んだ相談だけを選べる（9.4）
type Genre = { genreId: string; name: string };
type Consent = { caseId: string; status: string; respondedAt: string | null; articleCreated: boolean };
const staff = useStaff();
const genres = ref<Genre[]>([]);
const consents = ref<Consent[]>([]);
const form = reactive({ genreId: "", question: "", answer: "", sourceCaseId: "", checked: false });
const busy = ref(false);
const errorMessage = ref("");

onMounted(async () => {
  try {
    genres.value = (await $fetch<{ genreId: string; name: string }[]>("/api/genres")).map((g) => ({ genreId: g.genreId, name: g.name }));
    if (staff.value?.role === "admin") consents.value = (await $fetch<Consent[]>("/api/reuse-consents")).filter((c) => c.status === "agreed");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  }
});
async function save(publish: boolean) {
  if (publish && !window.confirm("この記事を公開します。よろしいですか？")) return;
  busy.value = true;
  errorMessage.value = "";
  try {
    const res = await $fetch<{ questionId: string }>("/api/qa-articles", { method: "POST", body: { ...form, sourceCaseId: form.sourceCaseId || undefined, publish } });
    await navigateTo(`/articles/${res.questionId}`);
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
    busy.value = false;
  }
}
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm narrow">
      <h1>Q&amp;A</h1>
      <QaTabs />
      <section class="panel">
        <h2>記事を作成する</h2>
        <p class="note">運営が作成した記事として公開されます（投稿者の表示IDは付きません）。過去の相談の内容をもとにする場合は、その相談について、ご本人の同意が済んでいることが条件です。</p>
        <label for="a-genre">ジャンル</label>
        <select id="a-genre" v-model="form.genreId">
          <option value="" disabled>選んでください</option>
          <option v-for="g in genres" :key="g.genreId" :value="g.genreId">{{ g.name }}</option>
        </select>
        <label for="a-q">質問文（2000文字まで）</label>
        <textarea id="a-q" v-model="form.question" rows="6" maxlength="2000" />
        <label for="a-a">回答文（5000文字まで）</label>
        <textarea id="a-a" v-model="form.answer" rows="10" maxlength="5000" />
        <template v-if="staff?.role === 'admin'">
          <label for="a-src">素材にした相談（同意済みのものだけ選べます）</label>
          <select id="a-src" v-model="form.sourceCaseId">
            <option value="">相談を素材にしていない</option>
            <option v-for="c in consents" :key="c.caseId" :value="c.caseId">{{ shortId(c.caseId) }}（{{ formatDate(c.respondedAt ?? "") }} 同意{{ c.articleCreated ? "・記事化済み" : "" }}）</option>
          </select>
        </template>
        <label class="check"><input v-model="form.checked" type="checkbox" />個人が特定され得る記述（固有名詞、細かい日時・年齢・人数など）が含まれていないことを確認しました</label>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        <div class="row">
          <button type="button" :disabled="busy || !form.checked || !form.genreId || !form.question.trim() || !form.answer.trim()" @click="save(true)">公開する</button>
          <button class="secondary" type="button" :disabled="busy || !form.checked || !form.genreId || !form.question.trim() || !form.answer.trim()" @click="save(false)">下書きとして保存する</button>
        </div>
      </section>
    </main>
  </div>
</template>
