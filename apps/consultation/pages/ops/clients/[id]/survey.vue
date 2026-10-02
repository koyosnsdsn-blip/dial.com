<script setup lang="ts">
// 初回アンケートの追加設問（要件 3.11.8・7.10.5）。運営管理者のみ。
// クライアントの要望を受けて、当社が入稿する。クライアント管理サイトからは編集できない。
import { apiErrorMessage } from "../../../../ops/format";
type Question = {
  questionId: string;
  kind: "attr" | "chief";
  text: string;
  aggregatable: boolean;
  active: boolean;
  createdAt: string;
  answeredThisQuarter: number;
  options: string[];
};
type Survey = { clientName: string; clientStatus: string; maxExtra: number; common: Question[]; extra: Question[] };
const DECLINE = "答えない";
const kindLabel: Record<string, string> = { attr: "属性（初回のみ聴取）", chief: "主訴（相談のたびに聴取）" };

const route = useRoute();
const clientId = computed(() => String(route.params.id));
const survey = ref<Survey | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");

const activeExtra = computed(() => (survey.value?.extra ?? []).filter((q) => q.active));
const retired = computed(() => (survey.value?.extra ?? []).filter((q) => !q.active));
const canAdd = computed(() => survey.value && survey.value.clientStatus !== "closed" && activeExtra.value.length < survey.value.maxExtra);
const total = computed(() => (survey.value?.common.length ?? 0) + activeExtra.value.length);

async function load() {
  try {
    survey.value = await $fetch<Survey>(`/api/ops/clients/${clientId.value}/survey`);
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

// 編集フォーム（新規作成と変更で共用。editing が "new" なら新規）
const editing = ref<string | null>(null);
const form = reactive({ text: "", kind: "chief" as "attr" | "chief", aggregatable: false, options: ["", ""], checklistConfirmed: false, reason: "" });
const saving = ref(false);
const formError = ref("");
const editingQuestion = computed(() => activeExtra.value.find((q) => q.questionId === editing.value) ?? null);
const filledOptions = computed(() => form.options.map((o) => o.trim()).filter((o) => o !== "" && o !== DECLINE));
const canSave = computed(() => form.text.trim() !== "" && filledOptions.value.length >= 2 && form.checklistConfirmed && form.reason.trim() !== "");

function openNew() {
  editing.value = "new";
  Object.assign(form, { text: "", kind: "chief", aggregatable: false, options: ["", ""], checklistConfirmed: false, reason: "" });
  formError.value = "";
  message.value = "";
}
function openEdit(q: Question) {
  editing.value = q.questionId;
  Object.assign(form, { text: q.text, kind: q.kind, aggregatable: q.aggregatable, options: q.options.filter((o) => o !== DECLINE), checklistConfirmed: false, reason: "" });
  formError.value = "";
  message.value = "";
}
function moveOption(i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= form.options.length) return;
  const list = form.options;
  [list[i], list[j]] = [list[j]!, list[i]!];
}

async function save() {
  saving.value = true;
  formError.value = "";
  try {
    const payload = { text: form.text, kind: form.kind, aggregatable: form.aggregatable, options: filledOptions.value, checklistConfirmed: form.checklistConfirmed, reason: form.reason };
    if (editing.value === "new") {
      await $fetch<unknown>(`/api/ops/clients/${clientId.value}/survey`, { method: "POST", body: payload });
      message.value = "設問を追加しました。";
    } else {
      const res = await $fetch<{ replaced: boolean }>(`/api/ops/clients/${clientId.value}/survey/${editing.value}`, { method: "PATCH", body: { action: "edit", ...payload } });
      message.value = res.replaced ? "回答済みの設問だったため、元の設問を取り下げて、新しい設問として登録しました。" : "設問を変更しました。";
    }
    editing.value = null;
    await load();
  } catch (e: any) {
    formError.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

async function retire(q: Question) {
  const reason = window.prompt(`「${q.text}」を取り下げます。以後、この設問は表示されません（過去の回答は残ります）。\n理由を入力してください。`);
  if (!reason || reason.trim() === "") return;
  message.value = "";
  try {
    await $fetch<unknown>(`/api/ops/clients/${clientId.value}/survey/${q.questionId}`, { method: "PATCH", body: { action: "retire", reason } });
    message.value = "設問を取り下げました。";
    editing.value = null;
    await load();
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  }
}

onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <p><NuxtLink :to="`/ops/clients/${clientId}`">← クライアントの設定へ戻る</NuxtLink></p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage && !survey" class="error">{{ errorMessage }}</p>

      <template v-else-if="survey">
        <div class="editing">編集中のクライアント：<strong>{{ survey.clientName }}</strong>　初回アンケートの追加設問</div>
        <p v-if="message" class="ok" role="status">{{ message }}</p>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

        <section class="panel">
          <h2>追加設問（{{ activeExtra.length }} / {{ survey.maxExtra }} 問）</h2>
          <p class="note">
            追加設問の目的は、相談員がこの組織の事情を事前に把握することです。回答は個人単位ではクライアントに開示されません（集計対象とした設問の単純集計のみ、最小集計単位を満たす場合に四半期レポートへ含められます）。
          </p>
          <p v-if="activeExtra.length === 0" class="note">追加設問はありません。</p>
          <div v-for="q in activeExtra" :key="q.questionId" class="q">
            <div class="q-head">
              <strong>{{ q.text }}</strong>
              <span class="badge">{{ q.kind === "attr" ? "属性" : "主訴" }}</span>
              <span v-if="q.aggregatable" class="badge agg">集計対象</span>
            </div>
            <p class="opts">{{ q.options.join(" ／ ") }}</p>
            <p v-if="q.answeredThisQuarter > 0" class="warn">今の四半期に {{ q.answeredThisQuarter }} 件の回答があります。変更すると、元の設問の集計はそこで打ち切られます。</p>
            <div class="row">
              <button class="secondary small" type="button" @click="openEdit(q)">変更</button>
              <button class="secondary small" type="button" @click="retire(q)">取り下げ</button>
            </div>
          </div>
          <button v-if="canAdd && editing !== 'new'" type="button" @click="openNew">設問を追加する</button>
          <p v-else-if="!canAdd && survey.clientStatus !== 'closed'" class="note">上限（{{ survey.maxExtra }} 問）に達しています。追加するには、既存の設問を取り下げてください。</p>
        </section>

        <section v-if="editing" class="panel">
          <h2>{{ editing === "new" ? "設問を追加する" : "設問を変更する" }}</h2>
          <p v-if="editingQuestion && editingQuestion.answeredThisQuarter > 0" class="warn">
            集計対象の設問は、四半期の境目での変更をおすすめします。期中に変更した場合、元の設問は取り下げとなり、新しい設問として扱われます。
          </p>
          <label for="q-text">設問文（200文字以内）</label>
          <input id="q-text" v-model="form.text" maxlength="200" placeholder="例：今回のご相談は、組織変更に関連しますか" />
          <div class="grid">
            <label>分類
              <select v-model="form.kind">
                <option value="chief">{{ kindLabel.chief }}</option>
                <option value="attr">{{ kindLabel.attr }}</option>
              </select>
            </label>
            <label class="check"><input v-model="form.aggregatable" type="checkbox" />四半期レポートの単純集計の対象にする</label>
          </div>

          <h3>選択肢（2〜10個）</h3>
          <div v-for="(_, i) in form.options" :key="i" class="opt-row">
            <input v-model="form.options[i]" maxlength="50" :aria-label="`選択肢${i + 1}`" />
            <button class="secondary small" type="button" :disabled="i === 0" @click="moveOption(i, -1)">↑</button>
            <button class="secondary small" type="button" :disabled="i === form.options.length - 1" @click="moveOption(i, 1)">↓</button>
            <button class="secondary small" type="button" :disabled="form.options.length <= 2" @click="form.options.splice(i, 1)">削除</button>
          </div>
          <div class="opt-row fixed"><input :value="DECLINE" disabled aria-label="自動で付く選択肢" /><span class="note">自動で付きます（削除できません）</span></div>
          <button class="secondary small" type="button" :disabled="form.options.length >= 10" @click="form.options.push('')">選択肢を追加</button>

          <div class="checklist">
            <p><strong>設けてはならない事項（例外なし）</strong></p>
            <ul>
              <li>氏名、社員番号、メールアドレス</li>
              <li>部署、拠点、事業所</li>
              <li>役職</li>
              <li>入社年次</li>
              <li>性別</li>
            </ul>
            <p class="note">健康状態・障害・病歴などを尋ねる設問は、要配慮個人情報の取得にあたり、個別の同意が必要です（3.11.7）。この画面からは設けないでください。</p>
            <label class="check"><input v-model="form.checklistConfirmed" type="checkbox" />設問文・選択肢が、上の事項に当たらないことを確認しました</label>
          </div>

          <label for="q-reason">理由（必須）</label>
          <input id="q-reason" v-model="form.reason" maxlength="500" placeholder="例：クライアントからの要望（組織変更後の状況把握）" />
          <div class="row">
            <button class="secondary" type="button" @click="editing = null">閉じる</button>
            <button type="button" :disabled="saving || !canSave" @click="save">{{ saving ? "保存中…" : "保存する" }}</button>
          </div>
          <p v-if="formError" class="error" role="alert">{{ formError }}</p>
        </section>

        <section class="panel">
          <h2>利用者に表示されるアンケート（初回・全 {{ total }} 問）</h2>
          <p class="note">2回目以降の相談では、属性の設問は表示されません。共通設問はこの画面からは変更できません。</p>
          <ol class="preview">
            <li v-for="q in [...survey.common, ...activeExtra]" :key="q.questionId">
              <span>{{ q.text }}</span>
              <span class="badge">{{ q.kind === "attr" ? "属性" : "主訴" }}</span>
              <span v-if="activeExtra.includes(q)" class="badge agg">追加設問</span>
              <p class="opts">{{ q.options.join(" ／ ") }}</p>
            </li>
          </ol>
        </section>

        <section v-if="retired.length" class="panel">
          <h2>取り下げた設問</h2>
          <p class="note">過去の回答は、回答時点の設問文・選択肢とともに保存されています。</p>
          <ul class="retired">
            <li v-for="q in retired" :key="q.questionId">{{ q.text }}<span class="muted">（{{ q.options.join(" ／ ") }}）</span></li>
          </ul>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 820px; margin: 24px auto; padding: 0 24px; }
.editing { padding: 12px 16px; background: #fff; border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 6px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
.warn { padding: 8px 12px; background: #fff8c5; color: #7d4e00; border-radius: 6px; font-size: 14px; }
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.panel h3 { font-size: 14px; margin: 18px 0 6px; }
.q { padding: 12px 0; border-top: 1px solid var(--line); }
.q-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.opts { margin: 4px 0 8px; font-size: 14px; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 16px; align-items: end; }
select { width: 100%; padding: 9px 10px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.check { display: flex; align-items: center; gap: 8px; margin: 8px 0; color: var(--fg); font-size: 14px; }
.check input { width: auto; }
.opt-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.opt-row input { flex: 1; }
.opt-row.fixed input { background: var(--bg); color: var(--muted); }
.checklist { margin-top: 16px; padding: 12px 14px; background: #fff8c5; border-radius: 6px; font-size: 14px; }
.checklist p { margin: 0 0 6px; }
.checklist ul { margin: 0 0 8px; padding-left: 1.2em; }
.row { display: flex; gap: 8px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
.badge { display: inline-block; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); }
.badge.agg { background: #ddf4ff; color: #0969da; }
.preview { padding-left: 1.4em; font-size: 14px; }
.preview li { margin-bottom: 8px; }
.preview .badge { margin-left: 6px; }
.retired { font-size: 14px; padding-left: 1.2em; }
.muted { color: var(--muted); }
</style>
