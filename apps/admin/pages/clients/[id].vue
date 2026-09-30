<script setup lang="ts">
// 契約クライアントの設定（要件 7.10.2〜7.10.4・7.10.9）。運営管理者のみ。
// 別のクライアントを誤って変更しないよう、編集中のクライアント名を常に表示する（7.10.1）。
// 変更はすべて理由が必須で、変更前後とあわせて監査ログに記録される。
// 未実装：初回アンケートの追加設問（7.10.5）、クライアント管理者アカウント（7.10.6）、ランディングページ（7.10.7）、
//         実績利用率と案件数の推移（7.10.2）
type Detail = {
  clientId: string;
  name: string;
  contractType: "corp" | "muni";
  status: "prep" | "active" | "closed";
  contractStart: string | null;
  contractEnd: string | null;
  employeeCount: number | null;
  assumedUsageRate: number | null;
  featureQa: boolean;
  featureConsult: boolean;
  featureVideo: boolean;
  slaHours: number;
  rallyMax: number;
  inviteCode: string | null;
  members: number;
  openCases: number;
  totalCases: number;
  counselorIds: string[];
  counselors: { counselorId: string; name: string; role: string; status: string }[];
};

const route = useRoute();
const clientId = computed(() => String(route.params.id));
const detail = ref<Detail | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");

const form = reactive({
  name: "",
  contractStart: "",
  contractEnd: "",
  employeeCount: "" as string | number,
  assumedUsageRate: "" as string | number,
  featureQa: true,
  featureConsult: true,
  featureVideo: true,
  rallyMax: 1,
  slaHours: 24,
  counselorIds: [] as string[],
  reason: "",
  approvedBy: "",
});

function fill(d: Detail) {
  Object.assign(form, {
    name: d.name,
    contractStart: d.contractStart ?? "",
    contractEnd: d.contractEnd ?? "",
    employeeCount: d.employeeCount ?? "",
    assumedUsageRate: d.assumedUsageRate ?? "",
    featureQa: d.featureQa,
    featureConsult: d.featureConsult,
    featureVideo: d.featureVideo,
    rallyMax: d.rallyMax,
    slaHours: d.slaHours,
    counselorIds: [...d.counselorIds],
    reason: "",
    approvedBy: "",
  });
}

async function load() {
  try {
    detail.value = await $fetch<Detail>(`/api/clients/${clientId.value}`);
    fill(detail.value);
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

const closed = computed(() => detail.value?.status === "closed");
const activeCounselors = computed(() => (detail.value?.counselors ?? []).filter((c) => c.status === "active" || form.counselorIds.includes(c.counselorId)));
const allOff = computed(() => !form.featureQa && !form.featureConsult && !form.featureVideo);
const standardPlan = computed(
  () =>
    (form.featureQa && form.featureConsult && form.featureVideo) ||
    (!form.featureQa && form.featureConsult && !form.featureVideo) ||
    (!form.featureQa && !form.featureConsult && form.featureVideo),
);
// 承認を要する設定に「変える」場合だけ、承認者の入力を求める（サーバー側でも同じ判定をする）
const needsApproval = computed(() => {
  const d = detail.value;
  if (!d) return false;
  const capacityChanged = form.rallyMax !== d.rallyMax || form.slaHours !== d.slaHours;
  const featuresChanged = form.featureQa !== d.featureQa || form.featureConsult !== d.featureConsult || form.featureVideo !== d.featureVideo;
  return (capacityChanged && (form.slaHours < 24 || form.rallyMax >= 4)) || (featuresChanged && !standardPlan.value);
});
// 変更によって所属者の画面から消える要素（要件 7.10.3：操作前に表示する）
const removed = computed(() => {
  const d = detail.value;
  if (!d) return [];
  const out: string[] = [];
  if (d.featureQa && !form.featureQa) out.push("Q&A（一覧・詳細）");
  if (d.featureConsult && !form.featureConsult) out.push("相談（申込・メッセージ）");
  if (d.featureVideo && !form.featureVideo) out.push("動画");
  return out;
});

const busy = ref("");
const actionError = ref("");
async function run(name: string, fn: () => Promise<string>) {
  busy.value = name;
  actionError.value = "";
  message.value = "";
  try {
    const done = await fn();
    await load();
    message.value = done;
  } catch (e: any) {
    actionError.value = apiErrorMessage(e);
  } finally {
    busy.value = "";
  }
}

function save() {
  return run("save", async () => {
    const res = await $fetch<{ unchanged?: boolean }>(`/api/clients/${clientId.value}`, {
      method: "PATCH",
      body: {
        name: form.name,
        contractStart: form.contractStart || null,
        contractEnd: form.contractEnd || null,
        employeeCount: form.employeeCount === "" ? null : form.employeeCount,
        assumedUsageRate: form.assumedUsageRate === "" ? null : form.assumedUsageRate,
        featureQa: form.featureQa,
        featureConsult: form.featureConsult,
        featureVideo: form.featureVideo,
        rallyMax: form.rallyMax,
        slaHours: form.slaHours,
        counselorIds: form.counselorIds,
        reason: form.reason,
        approvedBy: form.approvedBy,
      },
    });
    return res.unchanged ? "変更はありませんでした。" : "設定を保存しました。";
  });
}

// 準備中 → 有効
const activateReason = ref("");
const activateChecked = ref(false);
function activate() {
  return run("activate", async () => {
    await $fetch(`/api/clients/${clientId.value}`, { method: "PATCH", body: { status: "active", reason: activateReason.value } });
    activateReason.value = "";
    activateChecked.value = false;
    return "「有効」に切り替えました。招待コードが使えるようになりました。";
  });
}

// 招待コード
const codeReason = ref("");
const showCode = ref(false);
function inviteCode(action: "reissue" | "revoke") {
  const text = action === "reissue" ? "招待コードを再発行します。古いコードでは新しく登録できなくなります。よろしいですか？" : "招待コードを失効させます。再発行するまで、新しく登録できなくなります。よろしいですか？";
  if (!window.confirm(text)) return;
  return run("code", async () => {
    await $fetch(`/api/clients/${clientId.value}/invite-code`, { method: "POST", body: { action, reason: codeReason.value } });
    codeReason.value = "";
    showCode.value = action === "reissue";
    return action === "reissue" ? "招待コードを再発行しました。" : "招待コードを失効させました。";
  });
}
const copied = ref(false);
async function copyCode() {
  if (!detail.value?.inviteCode) return;
  await navigator.clipboard.writeText(detail.value.inviteCode);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

// 契約の終了
const closeForm = reactive({ reason: "", confirmName: "" });
function closeClient() {
  return run("close", async () => {
    const res = await $fetch<{ detached: number }>(`/api/clients/${clientId.value}/close`, { method: "POST", body: { ...closeForm } });
    Object.assign(closeForm, { reason: "", confirmName: "" });
    return `契約を終了しました。${res.detached} 件のアカウントの所属を解除しました。`;
  });
}

onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <p><NuxtLink to="/clients">← 契約クライアントの一覧へ戻る</NuxtLink></p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage && !detail" class="error">{{ errorMessage }}</p>

      <template v-else-if="detail">
        <div class="editing">
          編集中のクライアント：<strong>{{ detail.name }}</strong>
          <span class="badge" :class="detail.status">{{ clientStatusLabel[detail.status] }}</span>
          <span class="badge type">{{ contractTypeLabel[detail.contractType] }}（変更不可）</span>
        </div>
        <p v-if="message" class="ok" role="status">{{ message }}</p>
        <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

        <dl class="meta">
          <dt>登録件数</dt><dd>{{ detail.members }} 件<template v-if="detail.employeeCount">（契約上の従業員数 {{ detail.employeeCount }}）</template></dd>
          <dt>相談</dt><dd>対応中 {{ detail.openCases }} 件／累計 {{ detail.totalCases }} 件</dd>
        </dl>

        <section v-if="detail.status === 'prep'" class="panel prep">
          <h2>「有効」に切り替える</h2>
          <p class="note">準備中の間は、招待コードが機能しません。設定を確認してから切り替えてください。</p>
          <label class="check"><input v-model="activateChecked" type="checkbox" />機能設定・ラリー回数・返信SLAを確認しました（ランディングページは未実装のため対象外）</label>
          <label for="act-reason">理由（必須）</label>
          <input id="act-reason" v-model="activateReason" maxlength="500" placeholder="例：契約締結・設定完了のため" />
          <button type="button" :disabled="busy !== '' || !activateChecked || activateReason.trim() === '' || !detail.inviteCode" @click="activate">有効にする</button>
          <p v-if="!detail.inviteCode" class="note">招待コードが失効しています。先に再発行してください。</p>
        </section>

        <section class="panel">
          <h2>招待コード</h2>
          <template v-if="detail.inviteCode">
            <p class="code">
              <code>{{ showCode ? detail.inviteCode : "••••••••••••••••••••" }}</code>
              <button class="secondary small" type="button" @click="showCode = !showCode">{{ showCode ? "隠す" : "表示" }}</button>
              <button class="secondary small" type="button" @click="copyCode">{{ copied ? "コピーしました" : "コピー" }}</button>
            </p>
            <p v-if="detail.status === 'prep'" class="note">準備中のため、このコードはまだ機能しません。</p>
          </template>
          <p v-else class="note">招待コードは失効しています。</p>
          <template v-if="!closed">
            <label for="code-reason">再発行・失効の理由（必須）</label>
            <input id="code-reason" v-model="codeReason" maxlength="500" placeholder="例：コードが社外に流出したため" />
            <div class="row">
              <button class="secondary" type="button" :disabled="busy !== '' || codeReason.trim() === ''" @click="inviteCode('reissue')">再発行する</button>
              <button v-if="detail.inviteCode" class="secondary" type="button" :disabled="busy !== '' || codeReason.trim() === ''" @click="inviteCode('revoke')">失効させる</button>
            </div>
            <p class="note">有効期限はありません。再発行・失効をしても、すでに登録済みの利用者の所属は変わりません。</p>
          </template>
        </section>

        <section class="panel">
          <h2>契約・機能設定</h2>
          <fieldset :disabled="closed">
            <div class="grid">
              <label>名称<input v-model="form.name" maxlength="100" /></label>
              <label>契約開始日<input v-model="form.contractStart" type="date" /></label>
              <label>契約終了日<input v-model="form.contractEnd" type="date" /></label>
              <label v-if="detail.contractType === 'corp'">契約上の従業員数<input v-model="form.employeeCount" type="number" min="1" /></label>
              <label v-if="detail.contractType === 'corp'">想定利用率（%）<input v-model="form.assumedUsageRate" type="number" min="0" max="100" step="0.1" /></label>
            </div>

            <h3>機能の有効・無効</h3>
            <div class="checks">
              <label class="check"><input v-model="form.featureQa" type="checkbox" />機能1（Q&Aの閲覧）</label>
              <label class="check"><input v-model="form.featureConsult" type="checkbox" />機能2（相談）</label>
              <label class="check"><input v-model="form.featureVideo" type="checkbox" />機能3（動画）</label>
            </div>
            <p v-if="allOff" class="error">すべてを無効にすることはできません。</p>
            <p v-else-if="!standardPlan" class="warn">標準プラン（フル／相談のみ／動画のみ）以外の組み合わせです。例外として承認が必要です。</p>
            <p v-if="removed.length" class="warn">所属者の画面から消える要素：{{ removed.join("、") }}</p>
            <p v-if="detail.featureConsult && !form.featureConsult" class="warn">
              相談を無効にすると、ランディングページの文言（相談窓口としての案内）と四半期レポートの扱いが変わります。緊急時の案内は引き続き表示されます。
            </p>
            <p class="note">マイページは常に有効です（設定の対象外）。企業枠の有効期間は無期限で固定です。</p>

            <h3>ラリー回数・返信SLA</h3>
            <div class="grid">
              <label>ラリー回数（往復）
                <select v-model.number="form.rallyMax">
                  <option :value="1">1回（標準）</option>
                  <option :value="2">2回</option>
                  <option :value="3">3回</option>
                  <option :value="4">4回（要承認）</option>
                  <option :value="5">5回（要承認）</option>
                </select>
              </label>
              <label>返信SLA
                <select v-model.number="form.slaHours">
                  <option :value="48">48時間</option>
                  <option :value="24">24時間（標準）</option>
                  <option :value="12">12時間（要承認）</option>
                  <option :value="8">8時間（要承認）</option>
                </select>
              </label>
            </div>
            <p class="note">設定の変更は、変更後に開始された相談から適用されます。対応中の相談には適用されません。</p>

            <h3>割当対象の相談員</h3>
            <p class="note">チェックした相談員だけが、このクライアントの相談の自動割当の対象になります。1人も選ばない場合は限定しません。</p>
            <div class="checks">
              <label v-for="c in activeCounselors" :key="c.counselorId" class="check">
                <input v-model="form.counselorIds" type="checkbox" :value="c.counselorId" />
                {{ c.name }}<span class="muted">（{{ c.role === "admin" ? "運営管理者" : "相談員" }}<template v-if="c.status !== 'active'">・失効</template>）</span>
              </label>
            </div>

            <label v-if="needsApproval" for="approved-by">体制側の承認者（必須）</label>
            <input v-if="needsApproval" id="approved-by" v-model="form.approvedBy" maxlength="100" placeholder="承認した責任者の氏名" />
            <label for="save-reason">変更の理由（必須）</label>
            <input id="save-reason" v-model="form.reason" maxlength="500" placeholder="例：契約更新に伴う変更" />
            <button type="button" :disabled="busy !== '' || allOff || form.reason.trim() === '' || (needsApproval && form.approvedBy.trim() === '')" @click="save">
              {{ busy === "save" ? "保存中…" : "保存する" }}
            </button>
          </fieldset>
          <p v-if="closed" class="note">契約が終了しているため、変更できません。</p>
        </section>

        <section v-if="!closed" class="panel danger">
          <h2>契約を終了する</h2>
          <p class="note">
            このクライアントに所属する全アカウント（{{ detail.members }} 件）の所属を一括して解除します。解除後は無料会員として継続します。<br />
            対応中の相談（{{ detail.openCases }} 件）は終了まで継続し、過去の相談記録は利用者本人のものとして残ります。<strong>この操作は取り消せません。</strong>
          </p>
          <label for="close-reason">理由（必須）</label>
          <input id="close-reason" v-model="closeForm.reason" maxlength="500" placeholder="例：契約期間の満了" />
          <label for="close-name">確認のため、クライアント名「{{ detail.name }}」を入力してください</label>
          <input id="close-name" v-model="closeForm.confirmName" autocomplete="off" />
          <button class="danger-button" type="button" :disabled="busy !== '' || closeForm.reason.trim() === '' || closeForm.confirmName.trim() !== detail.name" @click="closeClient">
            契約を終了する
          </button>
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
.meta { display: grid; grid-template-columns: 6em 1fr; gap: 4px 12px; font-size: 14px; margin: 14px 0; }
.meta dt { color: var(--muted); }
.meta dd { margin: 0; }
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel.prep { border-color: #d4a72c; }
.panel.danger { border-color: #f1aeb5; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.panel h3 { font-size: 14px; margin: 20px 0 6px; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 16px; }
select { width: 100%; padding: 9px 10px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.checks { display: flex; flex-wrap: wrap; gap: 6px 20px; }
.check { display: flex; align-items: center; gap: 8px; margin: 4px 0; color: var(--fg); font-size: 14px; }
.check input { width: auto; }
.row { display: flex; gap: 8px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0 0 0 8px; padding: 4px 10px; font-size: 13px; }
.danger-button { background: var(--danger); }
.code code { font-size: 16px; padding: 4px 8px; background: var(--bg); border-radius: 4px; }
.badge { display: inline-block; margin-left: 8px; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); }
.badge.active { background: #dafbe1; color: #1a7f37; }
.badge.prep { background: #fff8c5; color: #7d4e00; }
.muted { color: var(--muted); }
</style>
