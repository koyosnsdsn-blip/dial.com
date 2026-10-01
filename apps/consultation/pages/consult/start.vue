<script setup lang="ts">
// 相談の開始：事前の説明 → アンケート（要件 3.11）→ 開始
// - 全設問を1画面に表示する。全問必須で、すべての設問に「答えない」がある（3.11.2）
// - 未回答の設問がある間は開始できず、残りの設問数を表示する
// - 開始前の確認として、お返事の回数と目安の時間を表示する（3.3.1：開始前には表示し、対話中には表示しない）
// - 勤務先に伝わる情報／伝わらない情報を明示する（3.10.3）。自治体委託型は報告への同意を取得する（3.12.4）
// 【仮】説明の文面・返信の目安の表現は暫定（SLAの起算方式が未決：未決事項 No.47、文面は No.74）
type Question = { questionId: string; kind: "attr" | "chief"; text: string; options: { optionId: string; label: string }[] };
type Survey = { contractType: "corp" | "muni" | null; personalFree: boolean; rallyMax: number; slaHours: number; questions: Question[] };

const survey = ref<Survey | null>(null);
const answers = reactive<Record<string, string>>({});
const muniConsent = ref(false);
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref("");

const remaining = computed(() => (survey.value?.questions ?? []).filter((q) => !answers[q.questionId]).length);
const needsConsent = computed(() => survey.value?.contractType === "muni");
const canStart = computed(() => remaining.value === 0 && (!needsConsent.value || muniConsent.value));

onMounted(async () => {
  try {
    const me = await loadMe();
    if (me.openCaseId) {
      await navigateTo(`/consult/${me.openCaseId}`, { replace: true });
      return;
    }
    survey.value = await $fetch<Survey>("/api/survey");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
});

async function start() {
  if (!canStart.value) return;
  busy.value = true;
  errorMessage.value = "";
  try {
    const res = await $fetch<{ caseId: string }>("/api/cases", {
      method: "POST",
      body: { answers: { ...answers }, muniConsent: muniConsent.value },
    });
    await navigateTo(`/consult/${res.caseId}`);
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
    busy.value = false;
  }
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="page">
      <h1>相談をはじめる</h1>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <template v-else-if="survey">
        <div class="card">
          <h2>はじめにお読みください</h2>
          <template v-if="survey.contractType === 'muni'">
            <p class="notice warn">
              <strong>このご相談の内容（やり取りの全文と、下の質問へのお答え）は、この事業の委託元へそのまま報告されます。</strong>
            </p>
          </template>
          <ul v-else-if="survey.personalFree">
            <li>お名前やメールアドレスをお聞きすることはありません。ニックネームのままご相談いただけます。</li>
            <li>ご相談の内容は、相談員と運営の担当者だけが確認します。</li>
          </ul>
          <ul v-else>
            <li>ご相談の内容が、勤務先に伝わることはありません。</li>
            <li>勤務先に、個人を特定できる形で共有される情報はありません。お名前・部署・社員番号は、このサービスではお預かりしていません。</li>
            <li>勤務先の担当部署は、3か月ごとの利用件数などの集計（個人を識別できないもの）を見ることができます。</li>
          </ul>
          <ul>
            <li>今回のご相談では、相談員からのお返事は <strong>{{ survey.rallyMax }}回</strong> です。そのあとも、費用のご負担なく、新しいご相談を何度でも始められます。</li>
            <li>お返事までの目安は <strong>{{ survey.slaHours }}時間</strong> です。</li>
            <li>このサービスは、緊急時の連絡手段ではありません。</li>
          </ul>
          <EmergencyLink />
        </div>

        <form class="card" @submit.prevent="start">
          <h2>いくつか教えてください</h2>
          <p class="note">
            答えたくない項目は「答えない」を選んでください。「答えない」を選んでも、ご相談への対応は変わりません。
          </p>
          <fieldset v-for="q in survey.questions" :key="q.questionId" class="question">
            <legend>{{ q.text }}</legend>
            <label v-for="o in q.options" :key="o.optionId" class="option">
              <input v-model="answers[q.questionId]" type="radio" :name="q.questionId" :value="o.optionId" />
              <span>{{ o.label }}</span>
            </label>
          </fieldset>

          <label v-if="needsConsent" class="option consent">
            <input v-model="muniConsent" type="checkbox" />
            <span>ご相談の内容が委託元へ報告されることに同意します</span>
          </label>
          <p v-if="needsConsent" class="note">
            同意されない場合、このご相談はご利用いただけません。お急ぎのときは、上の「お急ぎのとき」の案内をご覧ください。
          </p>

          <p class="note" aria-live="polite">
            {{ remaining > 0 ? `あと ${remaining} 問、選んでください。` : "すべて選択されました。" }}
          </p>
          <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
          <button type="submit" :disabled="!canStart || busy">{{ busy ? "開始しています…" : "この内容で相談をはじめる" }}</button>
        </form>
      </template>
      <template v-else>
        <p class="error" role="alert">{{ errorMessage }}</p>
        <NuxtLink class="button secondary" to="/consult">戻る</NuxtLink>
      </template>
    </main>
  </div>
</template>

<style scoped>
ul { margin: 0 0 12px; padding-left: 1.2em; }
li { margin-bottom: 6px; }
.question { margin: 0 0 18px; padding: 0; border: 0; }
.question legend { padding: 0; margin-bottom: 8px; font-weight: 600; }
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  margin-bottom: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
}
.option:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
.option input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); }
.consent { margin-top: 8px; }
</style>
