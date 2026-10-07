<script setup lang="ts">
// メッセージボックス（要件 3.2.1・3.4.2）
// - 各メッセージに送受信の時刻を表示し、日付が変わる箇所に区切りを入れる
// - 残りの往復回数・担当者の氏名や識別子・案件の通番は表示しない（3.3.1・3.6.1・3.4.2）
// - システムからの案内は、相談員の発言（吹き出し）と区別して表示する（7.14.3）
// - 緊急時の案内への導線を常設する（3.5）
// - 終了後は送信欄を閉じ、理由と再開の案内を表示する。同じ画面から新しい相談を始められる（3.4.2）
// - 相談員の返信は Realtime の合図を受けてサーバーAPIから取り直す（ポーリングしない）
// - 画像を添付できる（3.8）。送る前に端末の中で縮小し、撮影場所などの情報を取り除く
// - 自動文面は、管理側で上書きできる（7.14.3）。上書きがなければ既定の文面（utils/autoTexts.ts）
// 【仮】受付の自動応答・終了時の文面は暫定（未決事項 No.47・No.74）
type Message = { messageId: string; sender: "user" | "counselor"; body: string; sentAt: string; attachments: string[] };
type CaseView = {
  caseId: string;
  status: "open" | "closed";
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  continuity: "same" | "changed" | null;
  idleCloseAt: string | null;
  slaHours: number;
  contractType: "corp" | "muni" | null;
  canRestart: boolean;
  messages: Message[];
  reuseRequested: boolean;
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
  loadAutoTexts();
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
  if (d.continuity === "same") out.push({ type: "system", key: "cont", text: autoText("continuity_same") });
  if (d.continuity === "changed") out.push({ type: "system", key: "cont", text: autoText("continuity_changed") });

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
        text: autoText("accepted", { 返信までの時間: `${d.slaHours}時間` }),
        emergency: true,
      });
    }
  }
  return out;
});

// 自動終了の予告（要件 3.2.6）。予定日の3日前から表示する。【仮】予告の時期は未決（未決事項 No.61）
const IDLE_NOTICE_DAYS = 3;
const idleNotice = computed(() => {
  const at = detail.value?.idleCloseAt;
  if (!at || detail.value?.status !== "open") return "";
  const remaining = new Date(at).getTime() - Date.now();
  if (remaining > IDLE_NOTICE_DAYS * 86400000) return "";
  return autoText("idle_notice", { 終了予定日: formatDate(at) });
});

// 相談内容の削除（要件 9.3）。二段階で確認する
const deleteStep = ref<"" | "confirm">("");
const deleting = ref(false);
const deleteError = ref("");
async function deleteCase() {
  deleting.value = true;
  deleteError.value = "";
  try {
    await $fetch<unknown>(`/api/cases/${caseId.value}`, { method: "DELETE" });
    await navigateTo("/mypage");
  } catch (e: any) {
    deleteError.value = apiErrorMessage(e);
    deleting.value = false;
  }
}

// 相談の終了（本人による。2026-10-07 入江さんの指示）。二段階で確認する
const closeStep = ref<"" | "confirm">("");
const closing = ref(false);
const closeError = ref("");
async function closeCase() {
  closing.value = true;
  closeError.value = "";
  try {
    await $fetch<unknown>(`/api/cases/${caseId.value}/close`, { method: "POST" });
    closeStep.value = "";
    await Promise.all([load(true), loadMe()]);
  } catch (e: any) {
    closeError.value = apiErrorMessage(e);
  } finally {
    closing.value = false;
  }
}

// 添付する画像（1通につき3枚まで）
const MAX_IMAGES = 3;
const images = ref<{ blob: Blob; url: string }[]>([]);
const imageError = ref("");
async function pickImages(event: Event) {
  const input = event.target as HTMLInputElement;
  imageError.value = "";
  for (const file of Array.from(input.files ?? [])) {
    if (images.value.length >= MAX_IMAGES) {
      imageError.value = `画像は1通につき${MAX_IMAGES}枚までです。`;
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
      imageError.value = "画像を読み込めませんでした。別の画像でお試しください。";
    }
  }
  input.value = "";
}
function removeImage(i: number) {
  URL.revokeObjectURL(images.value[i].url);
  images.value.splice(i, 1);
}

// 二次利用（Q&A としての公開）への同意（要件 9.4）
const reuseBusy = ref(false);
const reuseDone = ref("");
async function answerReuse(agree: boolean) {
  reuseBusy.value = true;
  try {
    await $fetch<unknown>(`/api/reuse/${caseId.value}`, { method: "POST", body: { agree } });
    reuseDone.value = agree ? "ご協力ありがとうございます。お名前など、個人が分かる内容は取り除いたうえで掲載します。" : "承知しました。このご相談の内容は掲載しません。";
    if (detail.value) detail.value.reuseRequested = false;
  } catch (e: any) {
    reuseDone.value = apiErrorMessage(e);
  } finally {
    reuseBusy.value = false;
  }
}

async function send() {
  const text = draft.value.trim();
  if ((!text && images.value.length === 0) || sending.value) return;
  sending.value = true;
  sendError.value = "";
  try {
    let res: { failedImages?: number };
    if (images.value.length) {
      const form = new FormData();
      form.append("body", text);
      images.value.forEach((img, i) => form.append("images", img.blob, `image-${i + 1}.jpg`));
      res = await $fetch<{ failedImages?: number }>(`/api/cases/${caseId.value}/messages`, { method: "POST", body: form });
    } else {
      res = await $fetch<{ failedImages?: number }>(`/api/cases/${caseId.value}/messages`, { method: "POST", body: { body: text } });
    }
    draft.value = "";
    images.value.forEach((img) => URL.revokeObjectURL(img.url));
    images.value = [];
    if (res.failedImages) sendError.value = `メッセージは送信しましたが、画像 ${res.failedImages} 枚を送れませんでした。もう一度お試しください。`;
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
          <p v-if="detail.messages.length === 0 && detail.status === 'open'" class="system">{{ autoText("start_empty") }}</p>
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
                <div v-if="item.m.attachments.length" class="images">
                  <a v-for="a in item.m.attachments" :key="a" :href="`/api/cases/${detail.caseId}/attachments/${a}`" target="_blank" rel="noopener">
                    <img :src="`/api/cases/${detail.caseId}/attachments/${a}`" alt="添付された画像" loading="lazy" />
                  </a>
                </div>
                <time :datetime="item.m.sentAt">{{ formatTime(item.m.sentAt) }}</time>
              </div>
            </div>
          </template>

          <div v-if="detail.status === 'closed'" class="system closed">
            <p>{{ autoText(`closed_${detail.closeReason ?? "manual"}`) || closeReasonMessage(detail.closeReason) }}</p>
            <template v-if="detail.canRestart">
              <p>{{ autoText("restart_guide") }}</p>
              <NuxtLink class="button" to="/consult/start">新しい相談をはじめる</NuxtLink>
            </template>
            <p v-else class="note">このやり取りは、引き続きご覧いただけます。</p>
          </div>
          <p v-if="idleNotice" class="system">{{ idleNotice }}</p>
          <div ref="bottom"></div>
        </section>

        <form v-if="detail.status === 'open'" class="composer" @submit.prevent="send">
          <label class="field" for="draft">メッセージ</label>
          <textarea id="draft" v-model="draft" rows="5" maxlength="5000" placeholder="ここに入力してください"></textarea>
          <div v-if="images.length" class="picked">
            <div v-for="(img, i) in images" :key="img.url" class="thumb">
              <img :src="img.url" alt="送信する画像" />
              <button type="button" class="plain" @click="removeImage(i)">外す</button>
            </div>
          </div>
          <label class="attach">
            <input type="file" accept="image/png,image/jpeg" multiple :disabled="sending || images.length >= MAX_IMAGES" @change="pickImages" />
            <span>画像を添付する（{{ MAX_IMAGES }}枚まで）</span>
          </label>
          <p class="note">画像は縮小して送信します。撮影場所などの情報は取り除かれます。</p>
          <p v-if="imageError" class="error" role="alert">{{ imageError }}</p>
          <p v-if="sendError" class="error" role="alert">{{ sendError }}</p>
          <button type="submit" :disabled="sending || (draft.trim().length === 0 && images.length === 0)">{{ sending ? "送信中…" : "送信する" }}</button>
        </form>
        <section v-if="detail.status === 'open'" class="end">
          <button v-if="closeStep === ''" type="button" class="plain" @click="closeStep = 'confirm'">このご相談を終了する</button>
          <div v-else class="card stack">
            <p><strong>このご相談を終了します。</strong></p>
            <p class="note">
              終了すると、このご相談には、これ以上メッセージを送れなくなります。お話ししたいことが残っているときや、お返事をお待ちのときは、終了せずにそのままにしておいてください。
              終了したあとも、やり取りは履歴からいつでも読み返せます。新しいご相談も、いつでも始められます。
            </p>
            <p v-if="closeError" class="error" role="alert">{{ closeError }}</p>
            <button type="button" class="danger" :disabled="closing" @click="closeCase">{{ closing ? "終了しています…" : "終了する" }}</button>
            <button type="button" class="secondary" :disabled="closing" @click="closeStep = ''">やめる</button>
          </div>
        </section>
        <section v-if="detail.reuseRequested || reuseDone" class="card stack reuse">
          <template v-if="detail.reuseRequested">
            <h2>運営からのお願い</h2>
            <p>
              このご相談の内容を、お名前など個人が分かる内容を取り除いたうえで、同じような悩みを持つ方の参考になる「Q&A」として掲載してもよいでしょうか。
            </p>
            <p class="note">お断りいただいても、ご相談への対応は一切変わりません。</p>
            <button type="button" :disabled="reuseBusy" @click="answerReuse(true)">掲載してよい</button>
            <button type="button" class="secondary" :disabled="reuseBusy" @click="answerReuse(false)">掲載しないでほしい</button>
          </template>
          <p v-else role="status">{{ reuseDone }}</p>
        </section>
        <section v-if="detail.status === 'closed'" class="delete">
          <button v-if="deleteStep === ''" type="button" class="plain" @click="deleteStep = 'confirm'">このご相談を削除する</button>
          <div v-else class="card stack">
            <p><strong>このご相談のやり取りを削除します。削除すると、元に戻せません。</strong></p>
            <p class="note">削除すると、すぐにご相談の履歴から見えなくなり、一定期間ののちに完全に消去されます。残しておきたい場合は、先にマイページの「データをファイルに保存する」をご利用ください。</p>
            <p v-if="detail.contractType === 'muni'" class="notice warn">
              すでに委託元へ報告された記録は、この操作では削除できません。委託元での削除をご希望の場合は、委託元へお申し出ください。
            </p>
            <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
            <button type="button" class="danger" :disabled="deleting" @click="deleteCase">{{ deleting ? "削除しています…" : "削除する" }}</button>
            <button type="button" class="secondary" :disabled="deleting" @click="deleteStep = ''">やめる</button>
          </div>
        </section>
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
.images { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.images img { display: block; max-width: 160px; max-height: 160px; border-radius: 8px; border: 1px solid var(--line); }
.picked { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.thumb { text-align: center; }
.thumb img { display: block; width: 84px; height: 84px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); }
.composer .thumb button { margin-top: 2px; }
.attach { display: inline-block; margin-top: 10px; font-size: 0.9rem; color: var(--accent); text-decoration: underline; cursor: pointer; }
.attach input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.attach input:focus-visible + span { outline: 3px solid #7fb9b4; outline-offset: 2px; }
.reuse { margin-top: 20px; }
.delete, .end { margin-top: 28px; text-align: center; }
.delete .card, .end .card { text-align: left; }
button.danger { background: var(--danger); border-color: var(--danger); }
</style>
