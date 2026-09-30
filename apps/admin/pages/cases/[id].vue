<script setup lang="ts">
// 案件詳細（要件 7.3）
// 実装済み：やり取りの表示（送受信日時・日付の区切り 3.2.1）、返信、SLAタイマー（受信からの経過時間）、
//           緊急フラグ、往復回数の調整、対応完了、アンケート回答の表示（3.11。設問は仮：No.38）、緊急対応の記録（3.5）、担当変更（管理者）、案件の通番（3.4.2）
// 未実装（未決事項による）：SLAの期限表示（No.47）、相談サマリ（No.15）、
//           相談者へのメール通知（No.59）、テンプレート挿入（7.15 マスタ未整備）
type Message = { messageId: string; sender: "user" | "counselor"; body: string; sentAt: string; attachments: string[] };
type CaseDetail = {
  caseId: string;
  seq: number;
  quickRestart: boolean;
  quickRestartDays: number;
  clientName: string | null;
  frequentUse: boolean;
  frequentNote: string;
  repeatedAdjustments: boolean;
  deletedByUser: { requestedAt: string; purgeAfter: string | null } | null;
  draft: string;
  status: "open" | "closed";
  closeReason: string | null;
  urgent: boolean;
  openedAt: string;
  lastActivityAt: string;
  closedAt: string | null;
  awaitingReplySince: string | null;
  rallyUsed: number;
  rallyMax: number;
  slaHours: number;
  kind: "corp" | "personal";
  assigneeId: string | null;
  assigneeName: string | null;
  mine: boolean;
  canOperate: boolean;
  survey: { kind: "attr" | "chief"; question: string; answer: string }[];
  messages: Message[];
  reuseStatus: string;
  rallyAdjustments: { delta: number; reason: string | null; adjustedAt: string; byName: string | null }[];
  emergencyRecords: { recordId: string; detection: string | null; judgment: string | null; actionTaken: string | null; recordedAt: string; byName: string | null }[];
};
type StaffRow = { counselorId: string; name: string; role: string; status: string; absentNow: boolean; openCases: number };

const route = useRoute();
const staffMe = useStaff();
const isAdmin = computed(() => staffMe.value?.role === "admin");
const caseId = computed(() => String(route.params.id));
const detail = ref<CaseDetail | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const now = ref(Date.now());

async function load() {
  try {
    detail.value = await $fetch<CaseDetail>(`/api/cases/${caseId.value}`);
    // 保存済みの下書きは、最初に開いたときだけ入力欄に戻す（入力中の内容を上書きしない）
    if (!draftLoaded) {
      if (reply.value === "" && detail.value.draft) {
        reply.value = detail.value.draft;
        draftState.value = "saved";
      }
      await nextTick();
      draftLoaded = true;
    }
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

// やり取りに日付の区切りを挿入する（同一日は時刻のみ表示：要件 3.2.1）
const timeline = computed(() => {
  const out: ({ type: "date"; key: string; label: string } | { type: "msg"; key: string; m: Message })[] = [];
  let last = "";
  for (const m of detail.value?.messages ?? []) {
    const k = dayKey(m.sentAt);
    if (k !== last) {
      out.push({ type: "date", key: `d-${k}`, label: formatDate(m.sentAt) });
      last = k;
    }
    out.push({ type: "msg", key: m.messageId, m });
  }
  return out;
});

// アンケートの回答：属性と主訴を区別して表示する。緊急度が「すぐに話したい」の場合は強調する（要件 7.3・3.11.5）
// 【仮】強調の判定は選択肢のラベルで行う（設問・選択肢が未確定のため：未決事項 No.38）
const URGENT_ANSWER = "すぐに話したい";
const surveyGroups = computed(() => {
  const items = detail.value?.survey ?? [];
  return [
    { label: "主訴（今回のご相談）", items: items.filter((a) => a.kind === "chief") },
    { label: "属性", items: items.filter((a) => a.kind === "attr") },
  ].filter((g) => g.items.length > 0);
});

const remaining = computed(() => (detail.value ? Math.max(0, detail.value.rallyMax - detail.value.rallyUsed) : 0));
const waitingLevel = computed(() => {
  const d = detail.value;
  if (!d?.awaitingReplySince) return "none";
  const r = waitingRatio(d.awaitingReplySince, d.slaHours, now.value);
  return r >= 0.75 ? "high" : r >= 0.5 ? "mid" : "low";
});

// ---- 操作共通 ----
const busy = ref("");
const actionError = ref("");
async function run(name: string, fn: () => Promise<unknown>) {
  busy.value = name;
  actionError.value = "";
  try {
    await fn();
    await load();
    return true;
  } catch (e: any) {
    actionError.value = apiErrorMessage(e);
    return false;
  } finally {
    busy.value = "";
  }
}

// 返信
const reply = ref("");

// 返信テンプレート（要件 7.15）と下書きの自動保存（要件 7.3）
type Template = { templateId: string; title: string; body: string };
const templates = ref<Template[]>([]);
const templatePick = ref("");
function insertTemplate() {
  const t = templates.value.find((x) => x.templateId === templatePick.value);
  if (t) reply.value = reply.value.trim() === "" ? t.body : `${reply.value.replace(/\s+$/, "")}\n\n${t.body}`;
  templatePick.value = "";
}
const draftState = ref<"" | "saving" | "saved" | "error">("");
let draftLoaded = false;
let draftTimer: ReturnType<typeof setTimeout> | null = null;
async function saveDraft() {
  if (!detail.value?.canOperate) return;
  draftState.value = "saving";
  try {
    const res = await $fetch<{ saved: boolean }>(`/api/cases/${caseId.value}/draft`, { method: "PUT", body: { body: reply.value } });
    draftState.value = res.saved ? "saved" : "";
  } catch {
    draftState.value = "error";
  }
}
watch(reply, () => {
  if (!draftLoaded) return;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 1500);
});
onMounted(async () => {
  try {
    templates.value = await $fetch<Template[]>("/api/reply-templates");
  } catch {
    templates.value = [];
  }
});
onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer);
});
// 返信に添付する画像（1通につき3枚まで。送る前に縮小し、撮影場所などの情報を取り除く）
const images = ref<{ blob: Blob; url: string }[]>([]);
const imageError = ref("");
async function pickImages(event: Event) {
  const input = event.target as HTMLInputElement;
  imageError.value = "";
  for (const file of Array.from(input.files ?? [])) {
    if (images.value.length >= 3) {
      imageError.value = "画像は1通につき3枚までです。";
      break;
    }
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      imageError.value = "画像は PNG または JPEG のみ送れます。";
      continue;
    }
    try {
      const blob = await shrinkImage(file);
      images.value.push({ blob, url: URL.createObjectURL(blob) });
    } catch {
      imageError.value = "画像を読み込めませんでした。";
    }
  }
  input.value = "";
}
function removeImage(i: number) {
  URL.revokeObjectURL(images.value[i].url);
  images.value.splice(i, 1);
}

// 過去の相談（経緯の確認。要件 3.9）。AI による経緯サマリは LLM が未設定のため作らず、元のやり取りを開いて確認する
type Past = { caseId: string; openedAt: string; closedAt: string | null; closeReason: string | null; counselorName: string | null; chief: string[] };
const history = ref<{ llm: { configured: boolean }; items: Past[] } | null>(null);
const pastMessages = reactive<Record<string, { messageId: string; sender: "user" | "counselor"; body: string; sentAt: string }[]>>({});
const historyError = ref("");
async function loadHistory() {
  historyError.value = "";
  try {
    history.value = await $fetch<{ llm: { configured: boolean }; items: Past[] }>(`/api/cases/${caseId.value}/history`);
  } catch (e: any) {
    historyError.value = apiErrorMessage(e);
  }
}
async function openPast(p: Past) {
  if (pastMessages[p.caseId]) {
    delete pastMessages[p.caseId];
    return;
  }
  try {
    pastMessages[p.caseId] = await $fetch<{ messageId: string; sender: "user" | "counselor"; body: string; sentAt: string }[]>(`/api/cases/${caseId.value}/history/${p.caseId}`);
  } catch (e: any) {
    historyError.value = apiErrorMessage(e);
  }
}

// 二次利用（Q&A としての公開）への同意の依頼（要件 9.4）
const reuseReason = ref("");
const REUSE_LABEL: Record<string, string> = { requested: "依頼済み（応答待ち）", agreed: "同意が得られています", declined: "同意が得られませんでした（記事にしません）", expired: "期限切れのため失効しました（記事にしません）" };
async function requestReuse() {
  const ok = await run("reuse", () => $fetch<unknown>(`/api/cases/${caseId.value}/reuse`, { method: "POST", body: { reason: reuseReason.value } }));
  if (ok) reuseReason.value = "";
}

async function sendReply() {
  const ok = await run("reply", async () => {
    let res: { failedImages?: number };
    if (images.value.length) {
      const form = new FormData();
      form.append("body", reply.value);
      images.value.forEach((img, i) => form.append("images", img.blob, `image-${i + 1}.jpg`));
      res = await $fetch<{ failedImages?: number }>(`/api/cases/${caseId.value}/messages`, { method: "POST", body: form });
    } else {
      res = await $fetch<{ failedImages?: number }>(`/api/cases/${caseId.value}/messages`, { method: "POST", body: { body: reply.value } });
    }
    images.value.forEach((img) => URL.revokeObjectURL(img.url));
    images.value = [];
    if (res.failedImages) imageError.value = `返信は送信しましたが、画像 ${res.failedImages} 枚を送れませんでした。`;
  });
  if (ok) {
    if (draftTimer) clearTimeout(draftTimer);
    draftLoaded = false;
    reply.value = "";
    draftState.value = "";
    await nextTick();
    draftLoaded = true;
  }
}

// 緊急フラグ
const urgentReason = ref("");
async function setUrgent(urgent: boolean) {
  const ok = await run("urgent", () => $fetch<unknown>(`/api/cases/${caseId.value}/urgent`, { method: "POST", body: { urgent, reason: urgentReason.value } }));
  if (ok) urgentReason.value = "";
}

// 往復回数の調整
const rallyReason = ref("");
async function adjustRally(delta: 1 | -1) {
  const ok = await run("rally", () => $fetch<unknown>(`/api/cases/${caseId.value}/rally`, { method: "POST", body: { delta, reason: rallyReason.value } }));
  if (ok) rallyReason.value = "";
}

// 対応完了（個人課金で往復回数が残っている場合は残回数を明示して確認する：要件 3.4.2）
const closeReason = ref("");
const confirmingClose = ref(false);
async function closeCase() {
  const ok = await run("close", () => $fetch<unknown>(`/api/cases/${caseId.value}/close`, { method: "POST", body: { reason: closeReason.value } }));
  if (ok) {
    closeReason.value = "";
    confirmingClose.value = false;
  }
}

// 緊急対応の記録
const emergency = reactive({ detection: "", judgment: "", actionTaken: "" });
async function recordEmergency() {
  const ok = await run("emergency", () => $fetch<unknown>(`/api/cases/${caseId.value}/emergency`, { method: "POST", body: { ...emergency } }));
  if (ok) Object.assign(emergency, { detection: "", judgment: "", actionTaken: "" });
}

// 担当変更（運営管理者のみ）
const staffList = ref<StaffRow[]>([]);
const assignTo = ref("");
const assignReason = ref("");
async function loadStaffList() {
  if (!isAdmin.value) return;
  try {
    staffList.value = (await $fetch<StaffRow[]>("/api/staff")).filter((s) => s.status === "active");
  } catch {
    staffList.value = [];
  }
}
async function assign() {
  const ok = await run("assign", () =>
    $fetch<unknown>(`/api/cases/${caseId.value}/assign`, { method: "POST", body: { counselorId: assignTo.value, reason: assignReason.value } }),
  );
  if (ok) {
    assignTo.value = "";
    assignReason.value = "";
  }
}

// 他の相談員による変更・新着メッセージを即時反映する（この案件に関するものだけ）
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
useCaseRealtime((_, changedCaseId) => {
  if (changedCaseId !== caseId.value) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 300);
});

let clock: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  load();
  loadStaffList();
  clock = setInterval(() => (now.value = Date.now()), 30000);
});
onBeforeUnmount(() => clock && clearInterval(clock));
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <p><NuxtLink to="/">← ダッシュボードへ戻る</NuxtLink></p>

      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>

      <template v-else-if="detail">
        <div v-if="detail.urgent && detail.status === 'open'" class="urgent-banner" role="alert">この案件には緊急フラグが立っています</div>

        <div v-if="detail.deletedByUser" class="deleted-banner" role="status">
          この相談は、利用者本人が {{ formatDateTime(detail.deletedByUser.requestedAt) }} に削除しました。やり取りは非表示になっています<template v-if="detail.deletedByUser.purgeAfter">（{{ formatDateTime(detail.deletedByUser.purgeAfter) }} 以降に完全に消去する予定）</template>。
        </div>
        <p v-if="detail.frequentUse || detail.repeatedAdjustments" class="guard" role="status">
          <template v-if="detail.frequentUse">この相談者は、{{ detail.frequentNote }}の相談を開始しています。</template>
          <template v-if="detail.repeatedAdjustments">この案件では、往復回数の調整が繰り返されています。</template>
          支援が必要な状態か、制度の目的に合った利用かを確認してください（利用を止めるための表示ではありません）。
        </p>

        <div class="head">
          <h1>案件 {{ shortId(detail.caseId) }} <span class="seq">この相談者の {{ detail.seq }} 件目</span>
            <span v-if="detail.quickRestart" class="restart" :title="`前回の終了から${detail.quickRestartDays}日以内に開始された相談です。区切りが早すぎた、または課題が解決していない可能性があります`">短期間での再開</span></h1>
          <span v-if="detail.awaitingReplySince && detail.status === 'open'" class="sla" :class="waitingLevel">
            返信待ち {{ formatWaiting(detail.awaitingReplySince, now) }}（SLA {{ detail.slaHours }}時間）
          </span>
          <span v-else-if="detail.status === 'open'" class="sla none">返信待ちなし</span>
        </div>

        <dl class="meta">
          <dt>状態</dt><dd>{{ detail.status === "open" ? "対応中" : `終了（${formatCloseReason(detail.closeReason)}）` }}</dd>
          <dt>種別</dt><dd>{{ detail.kind === "corp" ? "企業枠" : "個人" }}<template v-if="detail.clientName">（{{ detail.clientName }}）</template></dd>
          <dt>担当</dt><dd>{{ detail.assigneeName ?? (detail.assigneeId ? "（他の相談員）" : "未割当") }}<span v-if="detail.mine">（自分）</span></dd>
          <dt>往復</dt><dd>{{ detail.rallyUsed }} / {{ detail.rallyMax }} 回（残り {{ remaining }} 回）</dd>
          <dt>開始</dt><dd>{{ formatDateTime(detail.openedAt) }}</dd>
          <dt v-if="detail.closedAt">終了</dt><dd v-if="detail.closedAt">{{ formatDateTime(detail.closedAt) }}</dd>
        </dl>

        <section v-if="detail.survey.length" class="survey" aria-label="アンケートの回答">
          <div v-for="group in surveyGroups" :key="group.label" class="survey-group">
            <h2>{{ group.label }}</h2>
            <dl>
              <template v-for="(a, i) in group.items" :key="i">
                <dt>{{ a.question }}</dt>
                <dd :class="{ hurry: a.answer === URGENT_ANSWER }">{{ a.answer }}</dd>
              </template>
            </dl>
          </div>
        </section>

        <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

        <div class="layout">
          <section class="panel conversation">
            <h2>やり取り</h2>
            <p v-if="detail.messages.length === 0" class="note">メッセージはまだありません。</p>
            <ol class="messages">
              <template v-for="item in timeline" :key="item.key">
                <li v-if="item.type === 'date'" class="date-sep"><span>{{ item.label }}</span></li>
                <li v-else :class="item.m.sender">
                  <div class="who">{{ item.m.sender === "user" ? "相談者" : "相談員" }}・{{ formatTime(item.m.sentAt) }}</div>
                  <div class="body">{{ item.m.body }}</div>
                  <div v-if="item.m.attachments.length" class="images">
                    <a v-for="a in item.m.attachments" :key="a" :href="`/api/cases/${detail.caseId}/attachments/${a}`" target="_blank" rel="noopener">
                      <img :src="`/api/cases/${detail.caseId}/attachments/${a}`" alt="添付された画像" loading="lazy" />
                    </a>
                  </div>
                </li>
              </template>
            </ol>

            <form v-if="detail.canOperate" class="reply" @submit.prevent="sendReply">
              <div class="reply-head">
                <label for="reply">返信</label>
                <select v-if="templates.length" v-model="templatePick" aria-label="テンプレートを挿入" @change="insertTemplate">
                  <option value="">テンプレートを挿入…</option>
                  <option v-for="t in templates" :key="t.templateId" :value="t.templateId">{{ t.title }}</option>
                </select>
              </div>
              <textarea id="reply" v-model="reply" rows="5" maxlength="5000" placeholder="相談者への返信を入力（本文中で氏名を名乗らないでください）" />
              <p class="note">
                送信すると往復回数を1回使います（残り {{ remaining }} 回）。<span v-if="remaining === 1"><b>この返信で上限に達し、案件は終了します。</b></span>
              </p>
              <div v-if="images.length" class="picked">
                <span v-for="(img, i) in images" :key="img.url"><img :src="img.url" alt="送信する画像" /><button class="secondary small" type="button" @click="removeImage(i)">外す</button></span>
              </div>
              <label class="attach">画像を添付する（3枚まで。PNG / JPEG）<input type="file" accept="image/png,image/jpeg" multiple :disabled="images.length >= 3" @change="pickImages" /></label>
              <p v-if="imageError" class="error" role="alert">{{ imageError }}</p>
              <p class="draft-state" aria-live="polite">
                {{ draftState === "saving" ? "下書きを保存しています…" : draftState === "saved" ? "下書きを保存しました" : draftState === "error" ? "下書きを保存できませんでした" : "" }}
              </p>
              <button type="submit" :disabled="busy !== '' || reply.trim() === ''">{{ busy === "reply" ? "送信中…" : "返信を送信" }}</button>
            </form>
            <p v-else-if="detail.status === 'closed'" class="note">この案件は終了しているため返信できません。</p>
            <p v-else class="note">担当相談員または運営管理者のみ返信できます。</p>
          </section>

          <aside class="side">
            <section class="panel">
              <h2>緊急フラグ</h2>
              <label for="urgent-reason">理由（必須）</label>
              <input id="urgent-reason" v-model="urgentReason" maxlength="500" placeholder="例：希死念慮をうかがわせる記述" />
              <button v-if="!detail.urgent" class="danger" type="button" :disabled="busy !== '' || urgentReason.trim() === ''" @click="setUrgent(true)">緊急フラグを立てる</button>
              <button v-else class="secondary" type="button" :disabled="busy !== '' || urgentReason.trim() === ''" @click="setUrgent(false)">緊急フラグを解除する</button>
              <p class="note">変更はほかの相談員・運営管理者の画面に即時に反映されます。</p>
            </section>

            <section v-if="detail.canOperate" class="panel">
              <h2>往復回数の調整</h2>
              <label for="rally-reason">理由（必須）</label>
              <input id="rally-reason" v-model="rallyReason" maxlength="500" placeholder="例：事案が複雑なため延長" />
              <div class="row">
                <button class="secondary" type="button" :disabled="busy !== '' || rallyReason.trim() === ''" @click="adjustRally(-1)">−1 回</button>
                <button class="secondary" type="button" :disabled="busy !== '' || rallyReason.trim() === ''" @click="adjustRally(1)">＋1 回</button>
              </div>
              <ul v-if="detail.rallyAdjustments.length" class="history">
                <li v-for="(a, i) in detail.rallyAdjustments" :key="i">
                  {{ formatDateTime(a.adjustedAt) }}　{{ a.delta > 0 ? "＋1" : "−1" }}　{{ a.reason }}<span v-if="a.byName">（{{ a.byName }}）</span>
                </li>
              </ul>
            </section>

            <section v-if="detail.canOperate" class="panel">
              <h2>対応完了</h2>
              <label for="close-reason">完了の理由（必須）</label>
              <input id="close-reason" v-model="closeReason" maxlength="500" placeholder="例：案内先の窓口につながったため" />
              <template v-if="!confirmingClose">
                <button class="secondary" type="button" :disabled="busy !== '' || closeReason.trim() === ''" @click="confirmingClose = true">対応を完了する</button>
              </template>
              <div v-else class="confirm">
                <p v-if="detail.kind === 'personal' && remaining > 0">
                  <b>往復回数が {{ remaining }} 回残っています。</b>個人課金のため、完了すると相談者は再開に再度の課金が必要になります。本当に完了しますか？
                </p>
                <p v-else>この案件を完了します。よろしいですか？</p>
                <div class="row">
                  <button class="secondary" type="button" @click="confirmingClose = false">やめる</button>
                  <button type="button" :disabled="busy !== ''" @click="closeCase">完了する</button>
                </div>
              </div>
              <p class="note">相談者への「新しいご相談としてお受けします」の案内は、相談者側の画面が完成してから表示されます。</p>
            </section>

            <section v-if="isAdmin" class="panel">
              <h2>担当の変更（管理者）</h2>
              <label for="assign-to">新しい担当</label>
              <select id="assign-to" v-model="assignTo">
                <option value="">選択してください</option>
                <option v-for="s in staffList" :key="s.counselorId" :value="s.counselorId" :disabled="s.counselorId === detail.assigneeId">
                  {{ s.name }}（{{ s.role === "admin" ? "管理者" : "相談員" }}・対応中 {{ s.openCases }} 件{{ s.absentNow ? "・不在中" : "" }}）
                </option>
              </select>
              <label for="assign-reason">理由（必須）</label>
              <input id="assign-reason" v-model="assignReason" maxlength="500" placeholder="例：担当者の休暇のため" />
              <button class="secondary" type="button" :disabled="busy !== '' || !assignTo || assignReason.trim() === ''" @click="assign">担当を変更する</button>
              <p class="note">返信待ちの経過時間は引継ぎ時点で数え直しません（要件 3.6）。</p>
            </section>

            <section class="panel">
              <h2>これまでの経緯</h2>
              <template v-if="history === null">
                <p class="note">同じ相談者の、過去の相談を確認できます（参照は記録されます）。</p>
                <button class="secondary" type="button" @click="loadHistory">過去の相談を表示する</button>
              </template>
              <template v-else>
                <p class="note">AI による経緯サマリは、まだ利用できません（設定前）。過去のやり取りを開いて確認してください。</p>
                <p v-if="history.items.length === 0" class="note">過去の相談はありません（今回が初回です）。</p>
                <ul class="history">
                  <li v-for="p in history.items" :key="p.caseId">
                    <div class="meta-line">{{ formatDate(p.openedAt) }} 開始<span v-if="p.counselorName">（{{ p.counselorName }}）</span></div>
                    <div v-if="p.chief.length">{{ p.chief.join("・") }}</div>
                    <button class="secondary small" type="button" @click="openPast(p)">{{ pastMessages[p.caseId] ? "閉じる" : "やり取りを開く" }}</button>
                    <ol v-if="pastMessages[p.caseId]" class="past">
                      <li v-for="m in pastMessages[p.caseId]" :key="m.messageId"><b>{{ m.sender === "user" ? "相談者" : "相談員" }}</b>・{{ formatDateTime(m.sentAt) }}<br /><span class="pre">{{ m.body }}</span></li>
                    </ol>
                  </li>
                </ul>
              </template>
              <p v-if="historyError" class="error" role="alert">{{ historyError }}</p>
            </section>

            <section v-if="detail.status === 'closed' && !detail.deletedByUser" class="panel">
              <h2>Q&amp;A への掲載の同意</h2>
              <p v-if="detail.reuseStatus !== 'unrequested'" class="note">{{ REUSE_LABEL[detail.reuseStatus] ?? detail.reuseStatus }}</p>
              <template v-else-if="detail.canOperate">
                <p class="note">この相談の内容を、匿名化したうえで Q&amp;A の記事にしたい場合に、ご本人へ同意を依頼します。利用者は相談の画面で答えます。断っても対応が変わらないことを、画面で伝えます。</p>
                <label for="reuse-reason">依頼の理由（必須）</label>
                <input id="reuse-reason" v-model="reuseReason" maxlength="500" placeholder="例：同じ悩みが多く寄せられているため" />
                <button class="secondary" type="button" :disabled="busy !== '' || reuseReason.trim() === ''" @click="requestReuse">同意を依頼する</button>
              </template>
              <p v-else class="note">まだ依頼していません。</p>
            </section>

            <section class="panel">
              <h2>緊急対応の記録</h2>
              <template v-if="detail.canOperate">
                <label for="em-detection">検知した内容（必須）</label>
                <textarea id="em-detection" v-model="emergency.detection" rows="2" maxlength="2000" />
                <label for="em-judgment">判断</label>
                <textarea id="em-judgment" v-model="emergency.judgment" rows="2" maxlength="2000" />
                <label for="em-action">実施した対応</label>
                <textarea id="em-action" v-model="emergency.actionTaken" rows="2" maxlength="2000" />
                <button class="secondary" type="button" :disabled="busy !== '' || emergency.detection.trim() === ''" @click="recordEmergency">記録する</button>
              </template>
              <ul v-if="detail.emergencyRecords.length" class="history">
                <li v-for="r in detail.emergencyRecords" :key="r.recordId">
                  <div class="meta-line">{{ formatDateTime(r.recordedAt) }}<span v-if="r.byName">（{{ r.byName }}）</span></div>
                  <div><b>検知：</b>{{ r.detection }}</div>
                  <div v-if="r.judgment"><b>判断：</b>{{ r.judgment }}</div>
                  <div v-if="r.actionTaken"><b>対応：</b>{{ r.actionTaken }}</div>
                </li>
              </ul>
              <p v-else class="note">記録はまだありません。</p>
            </section>
          </aside>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 1120px; margin: 24px auto; padding: 0 24px; }
.urgent-banner { margin-bottom: 16px; padding: 12px 16px; color: #fff; background: var(--danger); border-radius: 6px; font-weight: 700; }
.head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
.seq { font-size: 13px; font-weight: 400; color: var(--muted); margin-left: 8px; }
.deleted-banner { margin-bottom: 12px; padding: 10px 14px; background: #eaeef2; color: var(--fg); border-radius: 6px; font-size: 14px; }
.guard { padding: 8px 12px; background: #fff8c5; color: #7d4e00; border-radius: 6px; font-size: 14px; }
.restart { margin-left: 8px; padding: 2px 8px; font-size: 12px; font-weight: 600; border-radius: 10px; background: #fff8c5; color: #7d4e00; vertical-align: middle; }
.sla { font-size: 14px; padding: 4px 10px; border-radius: 12px; background: #ddf4ff; color: #0969da; }
.sla.mid { background: #fff8c5; color: #7d4e00; }
.sla.high { background: #fdecea; color: var(--danger); font-weight: 700; }
.sla.none { background: #eaeef2; color: var(--muted); }
.meta { display: grid; grid-template-columns: 5em 1fr; gap: 4px 12px; font-size: 14px; margin: 12px 0 16px; }
.meta dt { color: var(--muted); }
.meta dd { margin: 0; }
.survey { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 16px; }
.survey-group { padding: 12px 16px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.survey-group h2 { font-size: 13px; margin: 0 0 8px; color: var(--muted); }
.survey-group dl { margin: 0; font-size: 14px; }
.survey-group dt { color: var(--muted); font-size: 12px; }
.survey-group dd { margin: 0 0 6px; }
.survey-group dd.hurry { color: var(--danger); font-weight: 700; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
.panel { padding: 16px 18px; background: #fff; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 16px; }
.panel h2 { font-size: 15px; margin: 0 0 8px; }
.side .panel label { margin-top: 8px; }
button { width: auto; padding: 8px 16px; margin-top: 10px; }
button.danger { background: var(--danger); }
.row { display: flex; gap: 8px; }
select, textarea { width: 100%; padding: 8px 10px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; }
.messages { list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-direction: column; gap: 10px; }
.messages li { max-width: 85%; padding: 10px 14px; border-radius: 8px; background: var(--bg); }
.images { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.images img { display: block; max-width: 180px; max-height: 180px; border-radius: 6px; border: 1px solid var(--line); }
.picked { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0; }
.picked span { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
.picked img { width: 72px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid var(--line); }
.picked button { margin: 0; width: auto; padding: 2px 8px; font-size: 12px; }
.attach input { width: auto; padding: 4px 0; border: 0; font-size: 13px; }
.past { margin: 8px 0 0; padding-left: 1.2em; font-size: 13px; }
.past li { margin-bottom: 6px; }
.pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.messages li.counselor { align-self: flex-end; background: #ddf4ff; }
.messages li.date-sep { align-self: stretch; max-width: none; background: none; padding: 0; text-align: center; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--line); line-height: 0; margin: 10px 0; }
.messages li.date-sep span { background: #fff; padding: 0 10px; }
.messages .who { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.messages .body { white-space: pre-wrap; line-height: 1.7; }
.reply { border-top: 1px solid var(--line); padding-top: 12px; }
.reply-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.reply-head select { width: auto; max-width: 60%; padding: 4px 8px; font-size: 13px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.draft-state { min-height: 1.2em; margin: 4px 0 0; font-size: 12px; color: var(--muted); }
.confirm { margin-top: 10px; padding: 10px 12px; background: #fff8c5; border-radius: 6px; font-size: 14px; }
.history { list-style: none; padding: 0; margin: 12px 0 0; font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
.history li { padding-top: 8px; border-top: 1px dashed var(--line); }
.meta-line { color: var(--muted); font-size: 12px; }
</style>
