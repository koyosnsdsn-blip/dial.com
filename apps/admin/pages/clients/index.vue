<script setup lang="ts">
// 契約クライアントの一覧と新規登録（要件 7.10.1・7.10.8）。運営管理者のみ。
// 未実装：直近の実績利用率・管理者数の表示（集計とクライアント管理サイトが未実装）
type ClientRow = {
  clientId: string;
  name: string;
  contractType: "corp" | "muni";
  status: "prep" | "active" | "closed";
  contractStart: string | null;
  contractEnd: string | null;
  employeeCount: number | null;
  featureQa: boolean;
  featureConsult: boolean;
  featureVideo: boolean;
  slaHours: number;
  rallyMax: number;
  hasInviteCode: boolean;
  members: number;
  openCases: number;
};

const rows = ref<ClientRow[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const filterType = ref("");
// 終了したクライアントは既定の表示から除外する（要件 7.10.9）
const filterStatus = ref("not_closed");

const filtered = computed(() =>
  rows.value.filter(
    (r) =>
      (!filterType.value || r.contractType === filterType.value) &&
      (filterStatus.value === "" || (filterStatus.value === "not_closed" ? r.status !== "closed" : r.status === filterStatus.value)),
  ),
);

async function load() {
  try {
    rows.value = await $fetch<ClientRow[]>("/api/clients");
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

const form = reactive({
  name: "",
  contractType: "" as "" | "corp" | "muni",
  typeConfirmed: false,
  plan: "full",
  contractStart: "",
  contractEnd: "",
  employeeCount: "",
  assumedUsageRate: "",
});
const creating = ref(false);
const createError2 = ref("");
const canCreate = computed(() => form.name.trim() !== "" && form.contractType !== "" && form.typeConfirmed);
watch(
  () => form.contractType,
  () => (form.typeConfirmed = false),
);

async function create() {
  creating.value = true;
  createError2.value = "";
  try {
    const res = await $fetch<{ clientId: string }>("/api/clients", { method: "POST", body: { ...form } });
    await navigateTo(`/clients/${res.clientId}`);
  } catch (e: any) {
    createError2.value = apiErrorMessage(e);
  } finally {
    creating.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <h1>契約クライアント</h1>

      <div class="filters">
        <label>契約類型
          <select v-model="filterType">
            <option value="">すべて</option>
            <option value="corp">企業契約型</option>
            <option value="muni">自治体委託型</option>
          </select>
        </label>
        <label>契約ステータス
          <select v-model="filterStatus">
            <option value="not_closed">準備中・有効</option>
            <option value="prep">準備中</option>
            <option value="active">有効</option>
            <option value="closed">終了</option>
            <option value="">すべて</option>
          </select>
        </label>
      </div>

      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-else-if="filtered.length === 0" class="note">該当するクライアントはありません。</p>
      <div v-else class="table-wrap">
        <table class="list">
          <thead>
            <tr><th>名称</th><th>契約類型</th><th>ステータス</th><th>契約期間</th><th>プラン</th><th>ラリー／SLA</th><th>登録件数</th><th>対応中</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.clientId" :class="{ closed: r.status === 'closed' }">
              <td>{{ r.name }}</td>
              <td>{{ contractTypeLabel[r.contractType] }}</td>
              <td><span class="badge" :class="r.status">{{ clientStatusLabel[r.status] }}</span></td>
              <td>
                {{ r.contractStart ?? "—" }}〜{{ r.contractEnd ?? "—" }}
                <span v-if="endsSoon(r.contractEnd, r.status)" class="badge soon">満了が近い</span>
              </td>
              <td>{{ planLabel(r) }}</td>
              <td>{{ r.rallyMax }}回／{{ r.slaHours }}時間</td>
              <td>{{ r.members }}<template v-if="r.employeeCount"> / {{ r.employeeCount }}</template></td>
              <td>{{ r.openCases }} 件</td>
              <td><NuxtLink :to="`/clients/${r.clientId}`">設定</NuxtLink></td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="panel">
        <h2>クライアントを新規登録する</h2>
        <div class="grid">
          <label>名称<input v-model="form.name" maxlength="100" /></label>
          <label>契約類型
            <select v-model="form.contractType">
              <option value="" disabled>選択してください</option>
              <option value="corp">企業契約型</option>
              <option value="muni">自治体委託型</option>
            </select>
          </label>
          <label>プラン
            <select v-model="form.plan">
              <option value="full">フル（Q&A・相談・動画）</option>
              <option value="consult">相談のみ</option>
              <option value="video">動画のみ</option>
            </select>
          </label>
          <label>契約開始日<input v-model="form.contractStart" type="date" /></label>
          <label>契約終了日<input v-model="form.contractEnd" type="date" /></label>
          <label v-if="form.contractType !== 'muni'">契約上の従業員数<input v-model="form.employeeCount" type="number" min="1" /></label>
          <label v-if="form.contractType !== 'muni'">想定利用率（%）<input v-model="form.assumedUsageRate" type="number" min="0" max="100" step="0.1" /></label>
        </div>

        <div v-if="form.contractType" class="confirm">
          <p><strong>契約類型は、登録後に変更できません。</strong></p>
          <ul v-if="form.contractType === 'corp'">
            <li>相談内容・利用者個人の情報は、クライアントに一切開示しません。</li>
            <li>利用者には「勤務先には伝わらない」と説明します。</li>
          </ul>
          <ul v-else>
            <li>やり取りの全文とアンケートの回答を、委託元へ報告します。</li>
            <li>利用者には、相談の開始前に「委託元へ報告される」と明示し、同意を取得します。</li>
          </ul>
          <label class="check"><input v-model="form.typeConfirmed" type="checkbox" />「{{ contractTypeLabel[form.contractType] }}」で登録することを確認しました</label>
        </div>

        <button type="button" :disabled="creating || !canCreate" @click="create">{{ creating ? "登録中…" : "登録する" }}</button>
        <p v-if="createError2" class="error" role="alert">{{ createError2 }}</p>
        <p class="note">
          登録直後は「準備中」です。招待コードは自動で発行されますが、設定を終えて「有効」に切り替えるまで機能しません。<br />
          ラリー回数（既定1回）と返信SLA（既定24時間）は、登録後の設定画面で変更します。
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 1120px; margin: 24px auto; padding: 0 24px; }
.filters { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 12px; }
.filters label { margin: 0; }
.table-wrap { overflow-x: auto; }
table.list { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); font-size: 14px; }
.list th, .list td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
.list th { background: var(--bg); color: var(--muted); font-weight: 600; }
.list tr.closed td { color: var(--muted); }
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; max-width: 760px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 16px; }
select { width: 100%; padding: 9px 10px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.filters select { width: auto; }
button { width: auto; padding: 8px 16px; }
.confirm { margin-top: 14px; padding: 12px 14px; background: #fff8c5; border-radius: 6px; font-size: 14px; }
.confirm p { margin: 0 0 6px; }
.confirm ul { margin: 0 0 8px; padding-left: 1.2em; }
.check { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--fg); font-size: 14px; }
.check input { width: auto; }
.badge { display: inline-block; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); }
.badge.active { background: #dafbe1; color: #1a7f37; }
.badge.prep { background: #fff8c5; color: #7d4e00; }
.badge.soon { margin-left: 4px; background: #fdecea; color: var(--danger); }
</style>
