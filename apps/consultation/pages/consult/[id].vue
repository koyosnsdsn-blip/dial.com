<script setup lang="ts">
// メッセージボックス（要件 3.2.1・3.4.2）
// - 各メッセージに送受信の時刻を表示し、日付が変わる箇所に区切りを入れる
// - 残りの往復回数・担当者の氏名や識別子・案件の通番は表示しない（3.3.1・3.6.1・3.4.2）
// - システムからの案内は、相談員の発言（吹き出し）と区別して表示する（7.14.3）
// - 緊急時の案内への導線を常設する（3.5）
// - 終了後は送信欄を閉じ、理由と再開の案内を表示する。同じ画面から新しい相談を始められる（3.4.2）
// - 相談員の返信は Realtime の合図を受けてサーバーAPIから取り直す（ポーリングしない）
// 【仮】受付の自動応答・終了時の文面は暫定（未決事項 No.47・No.74）。添付ファイル（3.8）は未実装
type Message = { messageId: string; sender: "user" | "counselor"; body: string; sentAt: string };
type CaseView = {
  caseId: string;
  status: "open" | "closed";
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  continuity: "same" | "changed" | null;
  slaHours: number;
  contractType: "corp" | "muni" | null;
  canRestart: boolean;
  messages: Message[];
};
type Item =
  | { type: "date"; key: string; label: string }
  | { type: "msg"; key: string; m: Message }
  | { type: "system"; key: string; text: string; emergency?: boolean };

const route = useRoute();
const caseId = computed(() => String(route.params.id));
const detail = ref<CaseView | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const draft = ref("");
const sending = ref(false);
const sendError = ref("");
const bottom = ref<HTMLElement | null>(null);

async function load(scroll = false) {
  try {
    const before = detail.value?.messages.length ?? 0;
    detail.value = await $fetch<CaseView>(`/api/cases/${caseId.value}`);
    errorMessage.value = "";
    if (scroll || detail.value.messages.length !== before) {
      await nextTick();
      bottom.value?.scrollIntoView({ block: "end" });
    }
  } catch (e: any) {
    const status = e?.statusCode ?? e?.response?.status;
    if (status === 401) {
      await navigateTo("/");
      return;
    }
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

// Realtime の合図は短時間に続けて届くことがあるため、まとめて1回だけ取り直す
let timer: ReturnType<typeof setTimeout> | null = null;
useCaseRealtime(() => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => load(), 300);
});
// 画面に戻ってきたとき（タブの切り替え・スマホの復帰）に取り直す。相談員による対応完了などを反映するため
function onVisible() {
  if (document.visibilityState === "visible") load();
}
onMounted(() => {
  load(true);
  document.addEventListener("visibilitychange", onVisible);
});
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  document.removeEventListener("visibilitychange", onVisible);
});

const timeline = computed<Item[]>(() => {
  const d = detail.value;
  if (!d) return [];
  const out: Item[] = [];
  if (d.continuity === "same") out.push({ type: "system", key: "cont", text: "前回と同じ担当がお受けします。" });
  if (d.continuity === "changed") out.push({ type: "system", key: "cont", text: "今回は、前回と別の担当がお受けします。" });

  let last = "";
  let accepted = false;
  for (const m of d.messages) {
    const k = dayKey(m.sentAt);
    if (k !== last) {
      out.push({ type: "date", key: `d-${k}`, label: formatDate(m.sentAt) });
      last = k;
    }
    out.push({ type: "msg", key: m.messageId, m });
    // 受付の自動応答：この相談で最初の送信の直後にだけ表示する。返信までの時間は案件に複写された値から差し込む
    if (!accepted && m.sender === "user") {
      accepted = true;
      out.push({
        type: "system",
        key: "accepted",
        text: `メッセージを受け付けました。お返事までの目安は ${d.slaHours}時間 です。`,
        emergency: true,
      });
    }
  }
  return out;
});

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  sendError.value = "";
  try {
    await $fetch(`/api/cases/${caseId.value}/messages`, { method: "POST", body: { body: text } });
    draft.value = "";
    await load(true);
  } catch (e: any) {
    sendError.value = apiErrorMessage(e);
    if ((e?.statusMessage ?? e?.data?.statusMessage) === "case_closed") await load(true);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="box">
    <AppHeader />
    <main class="page">
      <p v-if="loading" class="note">読み込んでいます…</p>
      <template v-else-if="detail">
        <p v-if="detail.contractType === 'muni'" class="notice warn">
          このご相談の内容は、この事業の委託元へそのまま報告されます。
        </p>
        <EmergencyLink />

        <section class="timeline" aria-label="やり取り">
          <p v-if="detail.messages.length === 0 && detail.status === 'open'" class="system">
            ご相談の準備ができました。下の欄から、お話しになりたいことをお送りください。うまくまとまっていなくても大丈夫です。
          </p>
          <template v-for="item in timeline" :key="item.key">
            <p v-if="item.type === 'date'" class="date"><span>{{ item.label }}</span></p>
            <div v-else-if="item.type === 'system'" class="system">
              {{ item.text }}
              <template v-if="item.emergency">
                <br />お急ぎのとき・危険を感じるときは、<NuxtLink to="/emergency" target="_blank" rel="noopener">こちらの案内</NuxtLink>をご覧ください。
              </template>
            </div>
            <div v-else class="row" :class="item.m.sender">
              <div class="bubble">
                <span class="who">{{ item.m.sender === "user" ? "あなた" : "相談員" }}</span>
                <p class="body">{{ item.m.body }}</p>
                <time :datetime="item.m.sentAt">{{ formatTime(item.m.sentAt) }}</time>
              </div>
            </div>
          </template>

          <div v-if="detail.status === 'closed'" class="system closed">
            <p>{{ closeReasonMessage(detail.closeReason) }}</p>
            <template v-if="detail.canRestart">
              <p>お話ししたいことが残っている場合は、新しいご相談としてお受けします。費用のご負担はありません。</p>
              <NuxtLink class="button" to="/consult/start">新しい相談をはじめる</NuxtLink>
            </template>
            <p v-else class="note">このやり取りは、引き続きご覧いただけます。</p>
          </div>
          <div ref="bottom"></div>
        </section>

        <form v-if="detail.status === 'open'" class="composer" @submit.prevent="send">
          <label class="field" for="draft">メッセージ</label>
          <textarea id="draft" v-model="draft" rows="5" maxlength="5000" placeholder="ここに入力してください"></textarea>
          <p v-if="sendError" class="error" role="alert">{{ sendError }}</p>
          <button type="submit" :disabled="sending || draft.trim().length === 0">{{ sending ? "送信中…" : "送信する" }}</button>
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
.timeline { margin: 16px 0; }
.date { text-align: center; margin: 18px 0 10px; font-size: 0.8rem; color: var(--muted); }
.date span { padding: 2px 12px; background: #e9ece9; border-radius: 999px; }
.row { display: flex; margin-bottom: 10px; }
.row.user { justify-content: flex-end; }
.bubble { max-width: 86%; padding: 10px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
.row.user .bubble { background: var(--accent-soft); border-color: #c4dfdb; }
.who { display: block; font-size: 0.75rem; color: var(--muted); }
.body { margin: 2px 0 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
time { display: block; text-align: right; font-size: 0.75rem; color: var(--muted); }
/* システムからの案内：吹き出しにせず、区切り線つきの案内として表示する */
.system {
  margin: 16px 0;
  padding: 12px 8px;
  font-size: 0.88rem;
  color: var(--muted);
  text-align: center;
  border-top: 1px dashed #b9c2c0;
  border-bottom: 1px dashed #b9c2c0;
}
.system.closed { color: var(--fg); }
.system.closed p { margin-bottom: 10px; }
.composer { padding-top: 8px; border-top: 1px solid var(--line); }
.composer button { margin-top: 10px; }
</style>
