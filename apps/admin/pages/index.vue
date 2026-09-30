<script setup lang="ts">
// ダッシュボード（要件 7.1）
// - 緊急フラグのある案件を最上位に固定表示する
// - 緊急フラグの設定・解除、案件の追加は Supabase Realtime で即時に反映する（ポーリングしない：CLAUDE.md 制約#5）
// - SLAタイマーは未実装（起点時刻をサーバーから取得しクライアント側で計算する方式で後日追加：制約#6）
type CaseRow = {
  caseId: string;
  status: "open" | "closed";
  urgent: boolean;
  openedAt: string;
  lastActivityAt: string;
  rallyUsed: number;
  kind: "corp" | "personal";
  assigneeName: string | null;
  mine: boolean;
};

const cases = ref<CaseRow[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const includeClosed = ref(false);
const newlyUrgent = ref<Set<string>>(new Set());
const now = ref(Date.now());

const urgentCount = computed(() => cases.value.filter((c) => c.urgent && c.status === "open").length);

async function load() {
  try {
    const next = await $fetch<CaseRow[]>("/api/cases", { query: includeClosed.value ? { status: "all" } : {} });
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
onMounted(() => {
  load();
  clock = setInterval(() => (now.value = Date.now()), 30000);
});
onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
  if (titleTimer) clearInterval(titleTimer);
});
watch(includeClosed, load);
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

      <label class="toggle"><input v-model="includeClosed" type="checkbox" /> 終了した案件も表示する</label>

      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-else-if="cases.length === 0" class="note">表示できる案件はありません。</p>

      <table v-else class="cases">
        <thead>
          <tr>
            <th>状態</th>
            <th>案件</th>
            <th>種別</th>
            <th>担当</th>
            <th>開始</th>
            <th>最終更新</th>
            <th>往復</th>
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
              <span v-else-if="c.status === 'open'" class="badge">対応中</span>
              <span v-else class="badge muted">終了</span>
            </td>
            <td><NuxtLink :to="`/cases/${c.caseId}`">{{ shortId(c.caseId) }}</NuxtLink></td>
            <td>{{ c.kind === "corp" ? "企業枠" : "個人" }}</td>
            <td>{{ c.assigneeName ?? "未割当" }}<span v-if="c.mine" class="mine">（自分）</span></td>
            <td>{{ formatDateTime(c.openedAt) }}</td>
            <td>{{ formatElapsed(c.lastActivityAt, now) }}</td>
            <td>{{ c.rallyUsed }}</td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 1040px; margin: 24px auto; padding: 0 24px; }
.title-row { display: flex; align-items: baseline; justify-content: space-between; }
.live { font-size: 13px; color: var(--muted); }
.live.live { color: #1a7f37; }
.live.error { color: var(--danger); }
.urgent-banner {
  margin: 8px 0 16px;
  padding: 12px 16px;
  color: #fff;
  background: var(--danger);
  border-radius: 6px;
  font-weight: 700;
}
.toggle { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 12px; color: var(--fg); }
.toggle input { width: auto; }
table.cases { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); }
.cases th, .cases td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; font-size: 14px; }
.cases th { background: var(--bg); font-weight: 600; color: var(--muted); }
.cases tr.urgent td { background: #fdecea; }
.cases tr.closed td { color: var(--muted); }
.cases tr.flash td { animation: flash 1s ease-in-out 5; }
@keyframes flash { 50% { background: #f8b4ad; } }
.badge { display: inline-block; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #ddf4ff; color: #0969da; }
.badge.urgent { background: var(--danger); color: #fff; font-weight: 700; }
.badge.muted { background: #eaeef2; color: var(--muted); }
.mine { color: var(--muted); font-size: 12px; }
</style>
