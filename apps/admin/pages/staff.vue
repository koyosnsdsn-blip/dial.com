<script setup lang="ts">
// 相談員アカウントの管理（要件 7.12.1）。運営管理者のみ。
// 招待、権限区分（管理者／相談員）の変更、失効（担当中の案件は引継ぎ先へ付け替え）、不在期間の設定。
// いずれも理由が必須で、監査ログに記録される。
type StaffRow = {
  counselorId: string;
  name: string;
  role: "admin" | "counselor";
  status: "active" | "expired";
  email: string | null;
  lastSignInAt: string | null;
  invited: boolean;
  absentFrom: string | null;
  absentTo: string | null;
  absentNow: boolean;
  openCases: number;
  isSelf: boolean;
};

const rows = ref<StaffRow[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");

async function load() {
  try {
    rows.value = await $fetch<StaffRow[]>("/api/staff");
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

// 招待
const invite = reactive({ email: "", name: "", role: "counselor" });
const inviting = ref(false);
const inviteError = ref("");
async function sendInvite() {
  inviting.value = true;
  inviteError.value = "";
  message.value = "";
  try {
    await $fetch<unknown>("/api/staff", { method: "POST", body: { ...invite } });
    message.value = `${invite.email} に招待メールを送りました。本人がパスワードと2段階認証を設定すると利用できます。`;
    Object.assign(invite, { email: "", name: "", role: "counselor" });
    await load();
  } catch (e: any) {
    inviteError.value = apiErrorMessage(e);
  } finally {
    inviting.value = false;
  }
}

// 編集（1人ずつ開いて操作する）
const editing = ref<string | null>(null);
const form = reactive({ role: "counselor", status: "active", absentFrom: "", absentTo: "", handoverTo: "", reason: "" });
const saving = ref(false);
const editError = ref("");
const current = computed(() => rows.value.find((r) => r.counselorId === editing.value) ?? null);
const handoverCandidates = computed(() => rows.value.filter((r) => r.status === "active" && r.counselorId !== editing.value));
const needsHandover = computed(() => Boolean(current.value && form.status === "expired" && current.value.status === "active" && current.value.openCases > 0));

function openEdit(r: StaffRow) {
  editing.value = r.counselorId;
  Object.assign(form, { role: r.role, status: r.status, absentFrom: r.absentFrom ?? "", absentTo: r.absentTo ?? "", handoverTo: "", reason: "" });
  editError.value = "";
  message.value = "";
}
async function save() {
  if (!current.value) return;
  saving.value = true;
  editError.value = "";
  try {
    const body: Record<string, unknown> = { reason: form.reason };
    if (!current.value.isSelf) {
      body.role = form.role;
      body.status = form.status;
    }
    body.absentFrom = form.absentFrom || null;
    body.absentTo = form.absentTo || null;
    if (needsHandover.value) body.handoverTo = form.handoverTo;
    await $fetch<unknown>(`/api/staff/${current.value.counselorId}`, { method: "PATCH", body });
    message.value = `${current.value.name} さんの設定を変更しました。`;
    editing.value = null;
    await load();
  } catch (e: any) {
    editError.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <h1>相談員の管理</h1>
      <p v-if="message" class="ok" role="status">{{ message }}</p>

      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>

      <div v-else class="table-wrap">
        <table class="staff">
          <thead>
            <tr><th>氏名</th><th>権限</th><th>状態</th><th>メールアドレス</th><th>最終ログイン</th><th>対応中</th><th>不在</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.counselorId" :class="{ expired: r.status === 'expired' }">
              <td>{{ r.name }}<span v-if="r.isSelf" class="muted">（自分）</span></td>
              <td>{{ r.role === "admin" ? "運営管理者" : "相談員" }}</td>
              <td>
                <span v-if="r.status === 'expired'" class="badge muted">失効</span>
                <span v-else-if="r.invited" class="badge waiting">招待中</span>
                <span v-else class="badge">有効</span>
              </td>
              <td>{{ r.email ?? "—" }}</td>
              <td>{{ formatDateTime(r.lastSignInAt) }}</td>
              <td>{{ r.openCases }} 件</td>
              <td>
                <template v-if="r.absentFrom">{{ r.absentFrom }}〜{{ r.absentTo }}<span v-if="r.absentNow" class="badge waiting">不在中</span></template>
                <template v-else>—</template>
              </td>
              <td><button class="secondary small" type="button" @click="openEdit(r)">変更</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <section v-if="current" class="panel">
        <h2>{{ current.name }} さんの設定</h2>
        <div class="grid">
          <label>権限
            <select v-model="form.role" :disabled="current.isSelf">
              <option value="counselor">相談員</option>
              <option value="admin">運営管理者</option>
            </select>
          </label>
          <label>状態
            <select v-model="form.status" :disabled="current.isSelf">
              <option value="active">有効</option>
              <option value="expired">失効（ログイン不可）</option>
            </select>
          </label>
          <label>不在の開始日<input v-model="form.absentFrom" type="date" /></label>
          <label>不在の終了日<input v-model="form.absentTo" type="date" /></label>
        </div>
        <p v-if="current.isSelf" class="note">自分自身の権限・状態は変更できません（誰も管理できなくなることを防ぐため）。</p>
        <p class="note">不在期間中は、新しい相談の自動割当の対象から外れます（要件 7.12.1）。自動割当の対象は権限が「相談員」の人です。</p>

        <label v-if="needsHandover">引継ぎ先（必須：対応中の案件が {{ current.openCases }} 件あります）
          <select v-model="form.handoverTo">
            <option value="">選択してください</option>
            <option v-for="h in handoverCandidates" :key="h.counselorId" :value="h.counselorId">{{ h.name }}（対応中 {{ h.openCases }} 件）</option>
          </select>
        </label>

        <label for="staff-reason">理由（必須）</label>
        <input id="staff-reason" v-model="form.reason" maxlength="500" placeholder="例：退職のため" />
        <div class="row">
          <button class="secondary" type="button" @click="editing = null">閉じる</button>
          <button type="button" :disabled="saving || form.reason.trim() === '' || (needsHandover && !form.handoverTo)" @click="save">
            {{ saving ? "保存中…" : "保存する" }}
          </button>
        </div>
        <p v-if="editError" class="error" role="alert">{{ editError }}</p>
      </section>

      <section class="panel">
        <h2>相談員を招待する</h2>
        <div class="grid">
          <label>メールアドレス<input v-model="invite.email" type="email" autocomplete="off" /></label>
          <label>氏名（管理画面でのみ表示）<input v-model="invite.name" maxlength="100" /></label>
          <label>権限
            <select v-model="invite.role">
              <option value="counselor">相談員</option>
              <option value="admin">運営管理者</option>
            </select>
          </label>
        </div>
        <button type="button" :disabled="inviting || !invite.email || !invite.name.trim()" @click="sendInvite">{{ inviting ? "送信中…" : "招待メールを送る" }}</button>
        <p v-if="inviteError" class="error" role="alert">{{ inviteError }}</p>
        <p class="note">
          招待された人は、メールのリンクからパスワードを設定し、続けて2段階認証（認証アプリ）を登録します。<br />
          開発環境では、Supabase の組織メンバーのアドレスにしか招待メールが届きません（本番はメール配信サービスの設定が必要：未決事項 No.59）。
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 1120px; margin: 24px auto; padding: 0 24px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
.table-wrap { overflow-x: auto; }
table.staff { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); font-size: 14px; }
.staff th, .staff td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
.staff th { background: var(--bg); color: var(--muted); font-weight: 600; }
.staff tr.expired td { color: var(--muted); }
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; max-width: 760px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 16px; }
select { width: 100%; padding: 9px 10px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
.row { display: flex; gap: 8px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
.badge { display: inline-block; margin-left: 4px; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #ddf4ff; color: #0969da; }
.badge.waiting { background: #fff8c5; color: #7d4e00; }
.badge.muted { background: #eaeef2; color: var(--muted); }
.muted { color: var(--muted); }
</style>
