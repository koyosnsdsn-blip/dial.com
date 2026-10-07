<script setup lang="ts">
// 監査ログの閲覧（要件 7.16）。運営管理者のみ。閲覧のみ（編集・削除の機能は設けない）。
import { apiErrorMessage, formatDateTime, shortId } from "../../ops/format";
type Item = {
  logId: number;
  actedAt: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
};

// 操作種別の表示名。重点監視対象（要件 7.16）は important を付ける
const ACTIONS: Record<string, { label: string; important?: boolean }> = {
  "case.list": { label: "案件一覧の閲覧" },
  "case.view": { label: "案件（相談内容）の閲覧", important: true },
  "message.send": { label: "返信の送信" },
  "case.urgent.set": { label: "緊急フラグの設定", important: true },
  "case.urgent.clear": { label: "緊急フラグの解除", important: true },
  "case.rally.increase": { label: "往復回数の上限を増加" },
  "case.rally.decrease": { label: "往復回数の上限を減少" },
  "case.close": { label: "対応完了" },
  "case.assign": { label: "担当の変更" },
  "emergency.record": { label: "緊急対応の記録", important: true },
  "staff.list": { label: "相談員一覧の閲覧" },
  "staff.invite": { label: "相談員の招待", important: true },
  "staff.update": { label: "相談員の権限・状態の変更", important: true },
  "audit.view": { label: "監査ログの閲覧" },
  "client.list": { label: "契約クライアント一覧の閲覧" },
  "client.view": { label: "契約クライアントの閲覧" },
  "client.create": { label: "契約クライアントの登録", important: true },
  "client.update": { label: "契約クライアントの設定変更", important: true },
  "client.invite.reissue": { label: "招待コードの再発行", important: true },
  "client.invite.revoke": { label: "招待コードの失効", important: true },
  "client.admin.list": { label: "クライアント管理者の一覧の閲覧" },
  "client.admin.invite": { label: "クライアント管理者の発行", important: true },
  "client.admin.expire": { label: "クライアント管理者の失効", important: true },
  "client.admin.restore": { label: "クライアント管理者の再有効化", important: true },
  "client.report.list": { label: "四半期レポートの閲覧" },
  "client.report.generate": { label: "四半期レポートの作成・作り直し", important: true },
  "report.generate": { label: "四半期レポートの作成（自動）" },
  "portal.view": { label: "クライアント管理サイトの利用（クライアント管理者）" },
  "portal.report.view": { label: "四半期レポートの閲覧（クライアント管理者）" },
  "portal.admin.invite": { label: "クライアント管理者の追加（クライアント管理者）", important: true },
  "portal.admin.expire": { label: "クライアント管理者の削除（クライアント管理者）", important: true },
  "account.tier.update": { label: "会員区分の手動切り替え（暫定）", important: true },
  "qa.review.view": { label: "Q&A の投稿の確認" },
  "qa.publish": { label: "Q&A の回答・公開", important: true },
  "qa.reject": { label: "Q&A の投稿の却下", important: true },
  "qa.discard": { label: "Q&A の投稿の破棄", important: true },
  "qa.merge": { label: "Q&A の投稿のマージ" },
  "qa.history.disclose": { label: "投稿履歴の例外開示", important: true },
  "qa.article.create": { label: "Q&A の記事の直接作成", important: true },
  "qa.article.update": { label: "公開済みの Q&A の編集", important: true },
  "qa.article.delete": { label: "公開済みの Q&A の削除", important: true },
  "qa.report.fixed": { label: "通報への対応（修正）" },
  "qa.report.hidden": { label: "通報への対応（非公開化）", important: true },
  "qa.report.dismissed": { label: "通報への対応（却下）" },
  "qa.post": { label: "Q&A の投稿（利用者）" },
  "qa.delete": { label: "Q&A の投稿の削除（利用者）" },
  "qa.report": { label: "Q&A の通報（利用者）" },
  "genre.create": { label: "ジャンルの追加" },
  "genre.update": { label: "ジャンルの変更" },
  "genre.delete": { label: "ジャンルの削除", important: true },
  "video.create": { label: "動画の登録" },
  "video.update": { label: "動画の編集" },
  "video.scope.update": { label: "動画の配信範囲・公開状態の変更", important: true },
  "landing.update": { label: "ランディングページの入稿", important: true },
  "disclosure.list": { label: "開示請求の一覧の閲覧" },
  "disclosure.create": { label: "開示請求の受付", important: true },
  "disclosure.verify": { label: "開示請求：本人確認の完了", important: true },
  "disclosure.export": { label: "開示用データの出力", important: true },
  "disclosure.complete": { label: "開示請求：回答済み", important: true },
  "mail_template.update": { label: "メールテンプレートの変更", important: true },
  "auto_text.update": { label: "自動文面の変更", important: true },
  "reuse.request": { label: "二次利用同意の依頼", important: true },
  "reuse.list": { label: "二次利用同意の一覧の閲覧" },
  "reuse.agree": { label: "二次利用への同意（利用者）", important: true },
  "reuse.decline": { label: "二次利用への不同意（利用者）" },
  "attachment.view": { label: "添付画像の閲覧" },
  "attachment.purge": { label: "添付ファイルの消去（自動）" },
  "attachment.purge.run": { label: "添付ファイルの消去の実行" },
  "case.history.list": { label: "過去の相談の一覧の閲覧" },
  "case.history.view": { label: "過去の相談のやり取りの閲覧", important: true },
  "client.close": { label: "契約の終了（所属の一括解除）", important: true },
  "survey.view": { label: "追加設問の閲覧" },
  "survey.create": { label: "追加設問の作成", important: true },
  "survey.update": { label: "追加設問の変更", important: true },
  "survey.retire": { label: "追加設問の取り下げ", important: true },
  "account.lookup": { label: "利用者アカウントの照会", important: true },
  "account.posting.suspend": { label: "投稿機能の停止", important: true },
  "account.posting.resume": { label: "投稿機能の停止解除", important: true },
  "export.daily": { label: "CSV出力：日次サマリ", important: true },
  "export.survey_summary": { label: "CSV出力：アンケート集計", important: true },
  "settings.update": { label: "サービス全体設定の変更", important: true },
  "template.create": { label: "返信テンプレートの登録" },
  "template.update": { label: "返信テンプレートの変更" },
  "contact.create": { label: "公的窓口の登録", important: true },
  "contact.update": { label: "公的窓口の変更", important: true },
  "notice.create": { label: "お知らせの登録" },
  "notice.update": { label: "お知らせの変更" },
  "notice.delete": { label: "お知らせの取り下げ" },
  "inquiry.list": { label: "問い合わせ一覧の閲覧" },
  "inquiry.done": { label: "問い合わせを対応済みに" },
  "inquiry.reopen": { label: "問い合わせを未対応に戻す" },
  "deletion.list": { label: "削除依頼の状況の閲覧" },
  "deletion.retry": { label: "削除の再実行", important: true },
  "case.purge": { label: "削除された相談内容の消去（システム）", important: true },
  "account.withdraw": { label: "退会（利用者）", important: true },
  "inquiry.create": { label: "問い合わせの送信（利用者）" },
  "export.cases": { label: "CSV出力：案件明細", important: true },
  "export.survey": { label: "CSV出力：アンケート回答明細", important: true },
  "case.close.idle": { label: "無操作による自動終了（システム）" },
  "account.signup": { label: "利用者の新規登録（システム）" },
  "account.signup.code_failed": { label: "登録時の招待コード誤り（システム）" },
  // 以下は利用者本人の操作（相談者側アプリ）
  "case.delete": { label: "相談内容の削除（利用者）", important: true },
  "data.export": { label: "自身のデータの出力（利用者）", important: true },
  "case.start": { label: "相談の開始（利用者）" },
  "case.close.user": { label: "相談の終了（利用者本人）" },
  "client.link": { label: "招待コードによる所属の登録（利用者）" },
  "client.link.failed": { label: "招待コードの入力失敗（利用者）" },
  "attribute.update": { label: "属性の修正（利用者）" },
};

const route = useRoute();
const filters = reactive({
  action: "",
  from: "",
  to: "",
  target: typeof route.query.target === "string" ? route.query.target : "",
  actor: "",
});
const page = ref(1);
const data = ref<{ total: number; pageSize: number; items: Item[] } | null>(null);
const loading = ref(true);
const errorMessage = ref("");

async function load() {
  loading.value = true;
  try {
    const query: Record<string, string | number> = { page: page.value };
    for (const [k, v] of Object.entries(filters)) if (v) query[k] = v;
    data.value = await $fetch<{ total: number; pageSize: number; items: Item[] }>("/api/ops/audit-logs", { query });
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
function search() {
  page.value = 1;
  load();
}
function filterBy(kind: "actor" | "target", id: string) {
  filters[kind] = id;
  search();
}
const pages = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1));
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <h1>監査ログ</h1>
      <p class="note">記録は追記のみで、編集・削除はできません。この画面を開いたこと自体も記録されます。★は重点監視対象の操作です（要件 7.16）。</p>

      <form class="filters" @submit.prevent="search">
        <label>操作種別
          <select v-model="filters.action">
            <option value="">すべて</option>
            <option value="case.">案件に関する操作</option>
            <option value="case.view">案件（相談内容）の閲覧</option>
            <option value="case.urgent">緊急フラグ</option>
            <option value="emergency">緊急対応の記録</option>
            <option value="message">返信</option>
            <option value="staff">相談員の管理</option>
            <option value="audit">監査ログの閲覧</option>
          </select>
        </label>
        <label>開始日<input v-model="filters.from" type="date" /></label>
        <label>終了日<input v-model="filters.to" type="date" /></label>
        <label>対象ID<input v-model="filters.target" placeholder="案件IDなど（完全一致）" /></label>
        <label>実行者ID<input v-model="filters.actor" placeholder="完全一致" /></label>
        <button type="submit">検索</button>
      </form>

      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
      <template v-else-if="data">
        <p class="note">{{ data.total }} 件</p>
        <div class="table-wrap">
          <table class="logs">
            <thead>
              <tr><th>日時</th><th>実行者</th><th>操作</th><th>対象</th><th>理由・補足</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in data.items" :key="r.logId" :class="{ important: ACTIONS[r.action]?.important }">
                <td class="nowrap">{{ formatDateTime(r.actedAt) }}</td>
                <td class="nowrap">
                  <a v-if="r.actorId" href="#" @click.prevent="filterBy('actor', r.actorId)">{{ r.actorName ?? shortId(r.actorId) }}</a>
                  <span v-else>{{ r.actorType }}</span>
                </td>
                <td>{{ ACTIONS[r.action]?.important ? "★ " : "" }}{{ ACTIONS[r.action]?.label ?? r.action }}</td>
                <td class="nowrap">
                  <template v-if="r.targetId">
                    <NuxtLink v-if="r.targetType === 'cases'" :to="`/ops/cases/${r.targetId}`">{{ shortId(r.targetId) }}</NuxtLink>
                    <span v-else>{{ shortId(r.targetId) }}</span>
                    <a href="#" class="small" @click.prevent="filterBy('target', r.targetId)">絞り込む</a>
                  </template>
                  <span v-else class="muted">{{ r.targetType }}</span>
                </td>
                <td class="reason">{{ r.reason ?? "" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="pages > 1" class="pager">
          <button class="secondary" type="button" :disabled="page <= 1" @click="page--; load()">前へ</button>
          <span>{{ page }} / {{ pages }}</span>
          <button class="secondary" type="button" :disabled="page >= pages" @click="page++; load()">次へ</button>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 1120px; margin: 24px auto; padding: 0 24px; }
.filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin: 12px 0; }
.filters label { margin: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.filters input, .filters select { width: auto; min-width: 140px; padding: 6px 8px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.filters button { width: auto; margin: 0; padding: 7px 16px; }
.table-wrap { overflow-x: auto; }
table.logs { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); font-size: 13px; }
.logs th, .logs td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.logs th { background: var(--bg); color: var(--muted); font-weight: 600; }
.logs tr.important td { background: #fffbeb; }
.nowrap { white-space: nowrap; }
.reason { max-width: 360px; word-break: break-word; }
.small { margin-left: 8px; font-size: 12px; }
.muted { color: var(--muted); }
.pager { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.pager button { width: auto; margin: 0; padding: 6px 12px; }
</style>
