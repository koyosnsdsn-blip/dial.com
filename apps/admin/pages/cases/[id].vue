<script setup lang="ts">
// 案件詳細（要件 7.3）。現時点は、やり取りの閲覧と緊急フラグの設定・解除のみ。
// 返信の送信・SLAタイマー・相談サマリ・緊急対応記録（emergency_records）は後日追加。
type Message = { messageId: string; sender: "user" | "counselor"; body: string; sentAt: string };
type CaseDetail = {
  caseId: string;
  status: "open" | "closed";
  closeReason: string | null;
  urgent: boolean;
  openedAt: string;
  lastActivityAt: string;
  closedAt: string | null;
  rallyUsed: number;
  kind: "corp" | "personal";
  assigneeName: string | null;
  mine: boolean;
  messages: Message[];
};

const route = useRoute();
const caseId = computed(() => String(route.params.id));
const detail = ref<CaseDetail | null>(null);
const loading = ref(true);
const errorMessage = ref("");

const reason = ref("");
const saving = ref(false);
const saveError = ref("");

async function load() {
  try {
    detail.value = await $fetch<CaseDetail>(`/api/cases/${caseId.value}`);
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

async function setUrgent(urgent: boolean) {
  saving.value = true;
  saveError.value = "";
  try {
    await $fetch(`/api/cases/${caseId.value}/urgent`, { method: "POST", body: { urgent, reason: reason.value } });
    reason.value = "";
    await load();
  } catch (e: any) {
    saveError.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

// 他の相談員による緊急フラグの変更・新着メッセージを即時反映する（この案件に関するものだけ）
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
useCaseRealtime((_, changedCaseId) => {
  if (changedCaseId !== caseId.value) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 300);
});

onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <p><NuxtLink to="/">← ダッシュボードへ戻る</NuxtLink></p>

      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>

      <template v-else-if="detail">
        <div v-if="detail.urgent && detail.status === 'open'" class="urgent-banner" role="alert">
          この案件には緊急フラグが立っています
        </div>

        <h1>案件 {{ shortId(detail.caseId) }}</h1>
        <dl class="meta">
          <dt>状態</dt><dd>{{ detail.status === "open" ? "対応中" : "終了" }}</dd>
          <dt>種別</dt><dd>{{ detail.kind === "corp" ? "企業枠" : "個人" }}</dd>
          <dt>担当</dt><dd>{{ detail.assigneeName ?? "未割当" }}<span v-if="detail.mine">（自分）</span></dd>
          <dt>開始</dt><dd>{{ formatDateTime(detail.openedAt) }}</dd>
          <dt>最終更新</dt><dd>{{ formatDateTime(detail.lastActivityAt) }}</dd>
          <dt>往復回数</dt><dd>{{ detail.rallyUsed }}</dd>
        </dl>

        <section class="panel">
          <h2>緊急フラグ</h2>
          <p class="note">
            設定・解除はほかの相談員・運営管理者の画面に即時に反映され、理由とともに監査ログに記録されます。
          </p>
          <label for="reason">理由（必須）</label>
          <input id="reason" v-model="reason" maxlength="500" placeholder="例：希死念慮をうかがわせる記述があるため" />
          <button
            v-if="!detail.urgent"
            class="danger"
            type="button"
            :disabled="saving || reason.trim() === ''"
            @click="setUrgent(true)"
          >
            緊急フラグを立てる
          </button>
          <button v-else class="secondary" type="button" :disabled="saving || reason.trim() === ''" @click="setUrgent(false)">
            緊急フラグを解除する
          </button>
          <p v-if="saveError" class="error" role="alert">{{ saveError }}</p>
        </section>

        <section class="panel">
          <h2>やり取り</h2>
          <p v-if="detail.messages.length === 0" class="note">メッセージはまだありません。</p>
          <ol class="messages">
            <li v-for="m in detail.messages" :key="m.messageId" :class="m.sender">
              <div class="who">{{ m.sender === "user" ? "相談者" : "相談員" }}・{{ formatDateTime(m.sentAt) }}</div>
              <div class="body">{{ m.body }}</div>
            </li>
          </ol>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 760px; margin: 24px auto; padding: 0 24px; }
.urgent-banner { margin-bottom: 16px; padding: 12px 16px; color: #fff; background: var(--danger); border-radius: 6px; font-weight: 700; }
.meta { display: grid; grid-template-columns: 7em 1fr; gap: 6px 12px; font-size: 14px; }
.meta dt { color: var(--muted); }
.meta dd { margin: 0; }
.panel { margin-top: 24px; padding: 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
button { width: auto; padding: 8px 16px; }
button.danger { background: var(--danger); }
.messages { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.messages li { max-width: 85%; padding: 10px 14px; border-radius: 8px; background: var(--bg); }
.messages li.counselor { align-self: flex-end; background: #ddf4ff; }
.messages .who { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.messages .body { white-space: pre-wrap; line-height: 1.7; }
</style>
