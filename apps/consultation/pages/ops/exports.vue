<script setup lang="ts">
// データ出力（CSV。要件 7.9）。社内業務用の4種類。
// 出力できる範囲：運営管理者は全案件、相談員は自分の担当案件のみ。出力の操作は監査ログに記録される。
// 未実装：クライアント提出用（7.9.6。四半期レポートが未実装）
import { apiErrorMessage } from "../../ops/format";
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const from = ref(monthStart);
const to = ref(today);
const busy = ref("");
const errorMessage = ref("");

async function download(kind: "cases" | "survey" | "daily" | "survey-summary") {
  busy.value = kind;
  errorMessage.value = "";
  try {
    const res = await $fetch.raw<Blob>(`/api/ops/exports/${kind}`, { query: { from: from.value, to: to.value }, responseType: "blob" });
    const url = URL.createObjectURL(res._data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}_${from.value}_${to.value}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    const message = e?.statusMessage ?? e?.data?.statusMessage ?? e?.response?.statusText;
    errorMessage.value = apiErrorMessage({ statusMessage: message });
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <h1>データ出力（CSV）</h1>
      <section class="panel">
        <h2>対象期間（相談の開始日）</h2>
        <div class="row">
          <label>から<input v-model="from" type="date" /></label>
          <label>まで<input v-model="to" type="date" /></label>
        </div>
        <p class="note">最長1年分、5000件まで。それを超える場合は期間を分けてください。</p>
      </section>

      <section class="panel">
        <h2>案件明細</h2>
        <p class="note">案件ごとの状況（担当、日時、SLA、ラリー回数、緊急フラグ、相談ジャンルなど）。相談の内容と、利用者を識別する情報は含みません。</p>
        <button type="button" :disabled="busy !== ''" @click="download('cases')">{{ busy === "cases" ? "作成中…" : "案件明細を出力する" }}</button>
      </section>

      <section class="panel">
        <h2>アンケート回答明細</h2>
        <p class="note">案件ごとのアンケートの回答（属性・主訴）。「答えない」もそのまま出力します。利用者を識別する情報は含みません。<strong>この出力は、クライアントへ提出しないでください。</strong></p>
        <button type="button" :disabled="busy !== ''" @click="download('survey')">{{ busy === "survey" ? "作成中…" : "アンケート回答明細を出力する" }}</button>
      </section>

      <section class="panel">
        <h2>日次サマリ</h2>
        <p class="note">1日ごとの新規案件数、返信件数、完了件数、平均初回返信時間、SLA遵守率（暦時間での仮の判定）、緊急フラグの設定件数（運営管理者のみ）。</p>
        <button type="button" :disabled="busy !== ''" @click="download('daily')">{{ busy === "daily" ? "作成中…" : "日次サマリを出力する" }}</button>
      </section>

      <section class="panel">
        <h2>アンケート集計</h2>
        <p class="note">設問・選択肢ごとの件数と構成比、「答えない」の選択率。<strong>この出力は、クライアントへ提出しないでください</strong>（少人数でも内訳が出るため）。</p>
        <button type="button" :disabled="busy !== ''" @click="download('survey-summary')">{{ busy === "survey-summary" ? "作成中…" : "アンケート集計を出力する" }}</button>
      </section>

      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p class="note">
        出力できるのは、運営管理者は全案件、相談員は自分の担当案件です。出力したことは監査ログに記録されます。<br />
        ファイルは、メール添付や共有フォルダで広がりやすいものです。必要な人にだけ渡し、使い終わったら削除してください。
      </p>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 760px; margin: 24px auto; padding: 0 24px; }
.panel { margin-top: 16px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.row { display: flex; gap: 16px; }
.row label { margin: 0; }
.row input { width: auto; }
button { width: auto; padding: 8px 16px; margin-top: 8px; }
</style>
