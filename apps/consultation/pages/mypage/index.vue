<script setup lang="ts">
// マイページ：相談履歴（要件 3.4.1）、属性の確認・修正（3.11.9）、アカウント
// - 履歴には、開始日・状態・終了日と理由・主訴を表示する。通番・往復回数・担当者は表示しない
// - 企業会員向けの構成：決済・会員区分に関する表示は行わない（8.6.1.1）
// メールアドレスの変更（10.3.2）は /mypage/email。ニックネームで登録した方の通知用アドレスは /mypage/notify-email（未決事項一覧 2.17）。自身のデータの出力（10.3.4）はこの画面の下部。
// 運営への問い合わせ（10.5）は /contact、退会（10.3.3）は /mypage/withdraw。
// 通知の受信設定（10.2）は /mypage/notifications、自分の投稿（機能1）は /mypage/questions。
// 未実装：多要素認証の設定（10.3.5）、セッションの一覧（10.4）
type HistoryItem = {
  caseId: string;
  status: "open" | "closed";
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  hasUnread: boolean;
  chief: { question: string; answer: string }[];
};
type AttrItem = {
  questionId: string;
  text: string;
  options: { optionId: string; label: string }[];
  currentLabel: string;
  updatedAt: string | null;
};

const me = useMe();
const history = ref<HistoryItem[]>([]);
const attrs = ref<AttrItem[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const savingId = ref("");
const savedId = ref("");
const attrError = ref("");

onMounted(async () => {
  try {
    const [, h, a] = await Promise.all([
      loadMe(),
      $fetch<{ items: HistoryItem[] }>("/api/cases"),
      $fetch<{ items: AttrItem[] }>("/api/attributes"),
    ]);
    history.value = h.items;
    attrs.value = a.items;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
});

async function changeAttr(item: AttrItem, event: Event) {
  const optionId = (event.target as HTMLSelectElement).value;
  savingId.value = item.questionId;
  savedId.value = "";
  attrError.value = "";
  try {
    const res = await $fetch<{ label: string }>("/api/attributes", {
      method: "PUT",
      body: { questionId: item.questionId, optionId },
    });
    item.currentLabel = res.label;
    savedId.value = item.questionId;
  } catch (e: any) {
    attrError.value = apiErrorMessage(e);
  } finally {
    savingId.value = "";
  }
}
// 自身のデータの出力（要件 10.3.4）
const exporting = ref(false);
const exportError = ref("");
async function exportData(format: "csv" | "json") {
  exporting.value = true;
  exportError.value = "";
  try {
    const blob =
      format === "csv"
        ? // 受け取るときに先頭の BOM が取り除かれるので、Excel で文字化けしないよう付け直す。エラー時の判定のため、いったん文字列で受け取る
          new Blob(["\uFEFF" + (await $fetch<string>("/api/export", { query: { format: "csv" }, responseType: "text" }))], { type: "text/csv;charset=utf-8" })
        : new Blob([JSON.stringify(await $fetch<Record<string, unknown>>("/api/export"), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-data-${dayKey(new Date().toISOString())}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    exportError.value = apiErrorMessage(e);
  } finally {
    exporting.value = false;
  }
}

function currentOptionId(item: AttrItem): string {
  return item.options.find((o) => o.label === item.currentLabel)?.optionId ?? "";
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="page">
      <h1>マイページ</h1>
      <p v-if="loading" class="note">読み込んでいます…</p>
      <p v-else-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else>
        <section class="card">
          <h2>これまでのご相談</h2>
          <p v-if="history.length === 0" class="note">まだご相談はありません。</p>
          <ul v-else class="history">
            <li v-for="h in history" :key="h.caseId">
              <NuxtLink :to="`/consult/${h.caseId}`">
                <span class="state" :class="h.status">{{ h.status === "open" ? "対応中" : "終了" }}</span>
                <span v-if="h.hasUnread" class="state new">新しいお返事</span>
                <span class="dates">
                  {{ formatShortDate(h.openedAt) }} 開始
                  <template v-if="h.status === 'closed'">／ {{ formatShortDate(h.closedAt) }} 終了（{{ formatCloseReason(h.closeReason) }}）</template>
                </span>
                <span v-if="h.chief.length" class="chief">{{ h.chief.map((c) => c.answer).join("・") }}</span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section v-if="attrs.length" class="card">
          <h2>はじめにお答えいただいた内容</h2>
          <p class="note">変更した内容は、次回のご相談から反映されます。これまでのご相談の記録は変わりません。</p>
          <div v-for="a in attrs" :key="a.questionId" class="attr">
            <label class="field" :for="`attr-${a.questionId}`">{{ a.text }}</label>
            <select :id="`attr-${a.questionId}`" :value="currentOptionId(a)" :disabled="savingId === a.questionId" @change="changeAttr(a, $event)">
              <option v-if="!currentOptionId(a)" value="" disabled>{{ a.currentLabel }}</option>
              <option v-for="o in a.options" :key="o.optionId" :value="o.optionId">{{ o.label }}</option>
            </select>
            <p v-if="savedId === a.questionId" class="note" role="status">変更しました。次回のご相談から反映されます。</p>
          </div>
          <p v-if="attrError" class="error" role="alert">{{ attrError }}</p>
        </section>

        <section class="card stack">
          <h2>アカウント</h2>
          <p v-if="me?.nickname" class="note">ニックネーム：{{ me.nickname }}</p>
          <p v-else class="note">メールアドレス：{{ me?.email ?? "—" }}</p>
          <NuxtLink v-if="me && !me.linked" class="button secondary" to="/invite">招待コードを入力する</NuxtLink>
          <NuxtLink v-if="me && !me.nickname" class="button secondary" to="/mypage/email">メールアドレスを変更する</NuxtLink>
          <NuxtLink v-if="me?.nickname" class="button secondary" to="/mypage/notify-email">通知用のメールアドレスを登録する</NuxtLink>
          <NuxtLink v-if="me?.features.qaPost" class="button secondary" to="/mypage/questions">自分の投稿（Q&amp;A）</NuxtLink>
          <NuxtLink class="button secondary" to="/mypage/notifications">お知らせメールの設定</NuxtLink>
          <NuxtLink class="button secondary" to="/update-password">パスワードを変更する</NuxtLink>
          <button type="button" class="secondary" @click="signOut">ログアウト</button>
          <p class="note links"><NuxtLink to="/contact">運営への問い合わせ</NuxtLink>　／　<NuxtLink to="/mypage/withdraw">退会する</NuxtLink></p>
        </section>
      </template>
      <section v-if="!loading && !errorMessage" class="card stack">
        <h2>ご自身のデータの出力</h2>
        <p class="note">
          登録情報と、これまでのご相談（やり取りの全文・はじめにお答えいただいた内容）を、ファイルとして保存できます。<br />
          <strong>ファイルにはご相談の内容が含まれます。</strong>ご家族や職場の方と共用の端末・保存先には置かないよう、ご注意ください。
        </p>
        <button type="button" class="secondary" :disabled="exporting" @click="exportData('csv')">{{ exporting ? "準備しています…" : "表（CSV）で保存する：Excel などで開けます" }}</button>
        <button type="button" class="secondary" :disabled="exporting" @click="exportData('json')">全項目をデータ形式（JSON）で保存する</button>
        <p class="note">保存は、24時間に3回までです。</p>
        <p v-if="exportError" class="error" role="alert">{{ exportError }}</p>
      </section>
      <EmergencyLink />
    </main>
  </div>
</template>

<style scoped>
.history { list-style: none; margin: 0; padding: 0; }
.history li + li { border-top: 1px solid var(--line); }
.history a { display: block; padding: 12px 0; color: var(--fg); text-decoration: none; }
.state { display: inline-block; padding: 1px 10px; margin-right: 8px; font-size: 0.8rem; border-radius: 999px; background: #e9ece9; }
.state.open { background: var(--accent); color: #fff; }
.state.new { background: #b42318; color: #fff; }
.dates { font-size: 0.9rem; }
.chief { display: block; margin-top: 4px; font-size: 0.85rem; color: var(--muted); }
select { width: 100%; padding: 12px; font: inherit; border: 1px solid #aab3b1; border-radius: 8px; background: #fff; }
.attr + .attr { margin-top: 8px; }
</style>
