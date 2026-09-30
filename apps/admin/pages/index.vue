<script setup lang="ts">
// ダッシュボード・案件一覧（要件 7.1・7.2）
// - 緊急フラグのある案件を最上位に固定表示し、以降は返信待ちの起点が古い順
// - 変更は Supabase Realtime で即時に反映する（ポーリングしない：CLAUDE.md 制約#5）
// - 返信待ちの経過時間は、サーバーから受け取った起点時刻をもとにブラウザ側で計算する（制約#6）
// - SLAの期限・残り時間は起算方式が未決のため表示しない（未決事項 No.47）。経過が SLA 時間の半分・4分の3を超えたら色で強調する
type CaseRow = {
  caseId: string;
  status: "open" | "closed";
  closeReason: string | null;
  urgent: boolean;
  openedAt: string;
  lastActivityAt: string;
  awaitingReplySince: string | null;
  rallyUsed: number;
  rallyMax: number;
  rallyRemaining: number;
  slaHours: number;
  kind: "corp" | "personal";
  assigneeName: string | null;
  mine: boolean;
  clientName: string | null;
  hurry: boolean;
  quickRestart: boolean;
  frequentUse: boolean;
  deletedByUser: boolean;
};
type ClientOption = { clientId: string; name: string };

const staff = useStaff();
const cases = ref<CaseRow[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const newlyUrgent = ref<Set<string>>(new Set());
const now = ref(Date.now());
const filters = reactive({ status: "open", assignee: "all", kind: "all", urgent: false, client: "", from: "", to: "" });
const clientOptions = ref<ClientOption[]>([]);

const urgentCount = computed(() => cases.value.filter((c) => c.urgent && c.status === "open").length);
const awaitingCount = computed(() => cases.value.filter((c) => c.status === "open" && c.awaitingReplySince).length);
const unassignedCount = computed(() => cases.value.filter((c) => c.status === "open" && !c.assigneeName && !c.mine).length);

async function load() {
  try {
    const query: Record<string, string> = { status: filters.status, assignee: filters.assignee, kind: filters.kind };
    if (filters.urgent) query.urgent = "1";
    if (filters.client) query.client = filters.client;
    if (filters.from) query.from = filters.from;
    if (filters.to) query.to = filters.to;
    const next = await $fetch<CaseRow[]>("/api/cases", { query });
    // 前回の一覧では緊急でなかった案件が緊急になった場合、目立たせる
    const before = new Map(cases.value.map((c) => [c.caseId, c.urgent]));
    const becameUrgent = next.filter((c) => c.urgent && before.has(c.caseId) && !before.get(c.caseId));
    for (const c of becameUrgent) newlyUrgent.value.add(c.caseId);
    if (becameUrgent.length > 0) alertUrgent();
    cases.value = next;
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

function level(c: CaseRow): string {
  if (c.status !== "open" || !c.awaitingReplySince) return "";
  const r = waitingRatio(c.awaitingReplySince, c.slaHours, now.value);
  return r >= 0.75 ? "high" : r >= 0.5 ? "mid" : "";
}

// 画面を見ていない相談員にも気づけるよう、タブのタイトルを点滅させる（アプリ外への通知手段は未決事項 No.86）
let titleTimer: ReturnType<typeof setInterval> | null = null;
function alertUrgent() {
  if (titleTimer) return;
  const original = document.title;
  let on = false;
  titleTimer = setInterval(() => {
    on = !on;
    document.title = on ? "【緊急案件あり】" : original;
  }, 1000);
  setTimeout(() => {
    if (titleTimer) clearInterval(titleTimer);
    titleTimer = null;
    document.title = original;
  }, 15000);
}

// Realtime の通知は短時間に続けて届くことがあるため、まとめて1回だけ取り直す
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 300);
}
const { status: realtimeStatus } = useCaseRealtime(() => scheduleReload());

let clock: ReturnType<typeof setInterval> | null = null;
onMounted(async () => {
  load();
  try {
    clientOptions.value = await $fetch<ClientOption[]>("/api/client-options");
  } catch {
    clientOptions.value = [];
  }
  clock = setInterval(() => (now.value = Date.now()), 30000);
});
onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
  if (titleTimer) clearInterval(titleTimer);
});
watch(filters, load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <div class="title-row">
        <h1>ダッシュボード</h1>
        <span class="live" :class="realtimeStatus">
          {{ realtimeStatus === "live" ? "● リアルタイム接続中" : realtimeStatus === "connecting" ? "○ 接続中…" : "× リアルタイム接続が切れています。ページを再読み込みしてください" }}
        </span>
      </div>

      <div v-if="urgentCount > 0" class="urgent-banner" role="alert">
        緊急案件が {{ urgentCount }} 件あります。最上位から対応してください。
      </div>

      <div class="summary">
        <div class="tile"><span class="num">{{ awaitingCount }}</span><span class="label">返信待ち</span></div>
        <div class="tile"><span class="num">{{ urgentCount }}</span><span class="label">緊急</span></div>
        <div v-if="staff?.role === 'admin'" class="tile"><span class="num">{{ unassignedCount }}</span><span class="label">未割当</span></div>
      </div>

      <div class="filters">
        <label>状態
          <select v-model="filters.status">
            <option value="open">対応中</option>
            <option value="closed">終了</option>
            <option value="all">すべて</option>
          </select>
        </label>
        <label>担当
          <select v-model="filters.assignee">
            <option value="all">すべて</option>
            <option value="me">自分</option>
            <option v-if="staff?.role === 'admin'" value="unassigned">未割当</option>
          </select>
        </label>
        <label>種別
          <select v-model="filters.kind">
            <option value="all">すべて</option>
            <option value="personal">個人</option>
            <option value="corp">企業枠</option>
          </select>
        </label>
        <label>契約クライアント
          <select v-model="filters.client">
            <option value="">すべて</option>
            <option v-for="o in clientOptions" :key="o.clientId" :value="o.clientId">{{ o.name }}</option>
          </select>
        </label>
        <label>開始日（から）<input v-model="filters.from" type="date" /></label>
        <label>開始日（まで）<input v-model="filters.to" type="date" /></label>
        <label class="check"><input v-model="filters.urgent" type="checkbox" /> 緊急のみ</label>
      </div>

      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-else-if="cases.length === 0" class="note">該当する案件はありません。</p>

      <div v-else class="table-wrap">
        <table class="cases">
          <thead>
            <tr>
              <th>状態</th>
              <th>案件</th>
              <th>返信待ち</th>
              <th>種別・クライアント</th>
              <th>担当</th>
              <th>往復（残り）</th>
              <th>最終更新</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in cases"
              :key="c.caseId"
              :class="{ urgent: c.urgent && c.status === 'open', closed: c.status === 'closed', flash: newlyUrgent.has(c.caseId) }"
            >
              <td>
                <span v-if="c.urgent && c.status === 'open'" class="badge urgent">緊急</span>
                <span v-else-if="c.status === 'open' && c.awaitingReplySince" class="badge waiting">未返信</span>
                <span v-else-if="c.status === 'open'" class="badge">対応中</span>
                <span v-else class="badge muted" :title="formatCloseReason(c.closeReason)">終了</span>
                <span v-if="c.hurry && c.status === 'open'" class="badge hurry" title="相談者がアンケートで「すぐに話したい」を選択">すぐに話したい</span>
                <span v-if="c.quickRestart" class="badge restart" title="前回の終了から短期間で開始された相談">短期間での再開</span>
                <span v-if="c.frequentUse" class="badge restart" title="同じ相談者が短い期間に何度も相談を開始しています（確認の契機）">利用が頻繁</span>
                <span v-if="c.deletedByUser" class="badge muted" title="利用者本人が削除した相談（やり取りは非表示）">本人が削除</span>
              </td>
              <td><NuxtLink :to="`/cases/${c.caseId}`">{{ shortId(c.caseId) }}</NuxtLink></td>
              <td :class="['wait', level(c)]">{{ c.status === "open" && c.awaitingReplySince ? formatWaiting(c.awaitingReplySince, now) : "—" }}</td>
              <td>{{ c.kind === "corp" ? c.clientName ?? "企業枠" : "個人" }}<span class="sub">SLA {{ c.slaHours }}h</span></td>
              <td>{{ c.assigneeName ?? (c.mine ? "" : "未割当") }}<span v-if="c.mine" class="mine">{{ c.assigneeName ? "（自分）" : "自分" }}</span></td>
              <td>{{ c.rallyUsed }} / {{ c.rallyMax }}（{{ c.rallyRemaining }}）</td>
              <td>{{ formatElapsed(c.lastActivityAt, now) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 1080px; margin: 24px auto; padding: 0 24px; }
.title-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; justify-content: space-between; }
.live { font-size: 13px; color: var(--muted); }
.live.live { color: #1a7f37; }
.live.error { color: var(--danger); }
.urgent-banner { margin: 8px 0 16px; padding: 12px 16px; color: #fff; background: var(--danger); border-radius: 6px; font-weight: 700; }
.summary { display: flex; gap: 12px; margin: 8px 0 16px; }
.tile { display: flex; flex-direction: column; min-width: 110px; padding: 12px 16px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.tile .num { font-size: 24px; font-weight: 700; }
.tile .label { font-size: 13px; color: var(--muted); }
.filters { display: flex; flex-wrap: wrap; gap: 16px; align-items: end; margin-bottom: 12px; }
.filters label { margin: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.filters label.check { flex-direction: row; align-items: center; gap: 6px; color: var(--fg); }
.filters input[type="checkbox"] { width: auto; }
.filters select { padding: 6px 8px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.table-wrap { overflow-x: auto; }
table.cases { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); }
.cases th, .cases td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; font-size: 14px; white-space: nowrap; }
.cases th { background: var(--bg); font-weight: 600; color: var(--muted); }
.cases tr.urgent td { background: #fdecea; }
.cases tr.closed td { color: var(--muted); }
.cases tr.flash td { animation: flash 1s ease-in-out 5; }
@keyframes flash { 50% { background: #f8b4ad; } }
.wait.mid { color: #7d4e00; font-weight: 600; }
.wait.high { color: var(--danger); font-weight: 700; }
.sub { margin-left: 6px; font-size: 12px; color: var(--muted); }
.badge { display: inline-block; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #ddf4ff; color: #0969da; }
.badge.urgent { background: var(--danger); color: #fff; font-weight: 700; }
.badge.waiting { background: #fff8c5; color: #7d4e00; }
.badge.muted { background: #eaeef2; color: var(--muted); }
.badge.hurry { margin-left: 4px; background: #fdecea; color: var(--danger); font-weight: 700; }
.badge.restart { margin-left: 4px; background: #fff8c5; color: #7d4e00; }
.filters input[type="date"] { width: auto; padding: 5px 8px; font-size: 14px; }
.mine { color: var(--muted); font-size: 12px; }
</style>
