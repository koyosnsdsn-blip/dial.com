<script setup lang="ts">
// 先生の管理（未決事項 2.19）。運営管理者のみ。
// 先生＝公開Q&Aにコメントをお寄せいただく専門家（弁護士・社労士・メンタル相談の先生など）。相談員とは別のアカウント・別の入口（/ops/expert-login）。
// 登録（招待）、表示内容の変更、担当ジャンルの割り当て、停止／再開。いずれも理由が必須で、監査ログに記録される。
import { apiErrorMessage, formatDateTime } from "../../ops/format";
type ExpertRow = {
  expertId: string;
  displayName: string;
  qualification: string;
  affiliation: string | null;
  bio: string | null;
  status: "active" | "suspended";
  email: string | null;
  genreIds: string[];
  lastSignInAt: string | null;
  invited: boolean;
  published: number;
  pending: number;
};
type Genre = { genreId: string; name: string };

const rows = ref<ExpertRow[]>([]);
const genres = ref<Genre[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");
const genreName = (id: string) => genres.value.find((g) => g.genreId === id)?.name ?? "（削除済み）";

async function load() {
  try {
    const [e, g] = await Promise.all([$fetch<ExpertRow[]>("/api/ops/experts"), $fetch<Genre[]>("/api/ops/genres")]);
    rows.value = e;
    genres.value = g;
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}

// 【暫定】パスワード設定用のリンク（メール送信の仕組みが入るまで、メールの代わりに画面へ表示する）
const setupLink = ref<{ name: string; link: string; note: string } | null>(null);

// 登録
const invite = reactive({ email: "", displayName: "", qualification: "", affiliation: "", bio: "", genreIds: [] as string[] });
const inviting = ref(false);
const inviteError = ref("");
async function sendInvite() {
  inviting.value = true;
  inviteError.value = "";
  message.value = "";
  try {
    const res = await $fetch<{ link: string; note: string }>("/api/ops/experts", { method: "POST", body: { ...invite } });
    setupLink.value = { name: invite.displayName.trim(), link: res.link, note: res.note };
    message.value = `${invite.displayName.trim()} 先生を登録しました。下のリンクを本人に渡してください。本人がパスワードと2段階認証を設定すると利用できます。`;
    Object.assign(invite, { email: "", displayName: "", qualification: "", affiliation: "", bio: "", genreIds: [] });
    await load();
  } catch (e: any) {
    inviteError.value = apiErrorMessage(e);
  } finally {
    inviting.value = false;
  }
}

// 編集（1人ずつ開いて操作する）
const editing = ref<string | null>(null);
const form = reactive({ displayName: "", qualification: "", affiliation: "", bio: "", genreIds: [] as string[], status: "active", reason: "" });
const saving = ref(false);
const issuing = ref(false);
const editError = ref("");
const current = computed(() => rows.value.find((r) => r.expertId === editing.value) ?? null);
function openEdit(r: ExpertRow) {
  editing.value = r.expertId;
  Object.assign(form, { displayName: r.displayName, qualification: r.qualification, affiliation: r.affiliation ?? "", bio: r.bio ?? "", genreIds: [...r.genreIds], status: r.status, reason: "" });
  editError.value = "";
  message.value = "";
}
async function save() {
  if (!current.value) return;
  saving.value = true;
  editError.value = "";
  try {
    await $fetch<unknown>(`/api/ops/experts/${current.value.expertId}`, {
      method: "PATCH",
      body: { displayName: form.displayName, qualification: form.qualification, affiliation: form.affiliation, bio: form.bio, genreIds: form.genreIds, status: form.status, reason: form.reason },
    });
    message.value = `${current.value.displayName} 先生の設定を変更しました。`;
    editing.value = null;
    await load();
  } catch (e: any) {
    editError.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}
async function reissueLink() {
  if (!current.value) return;
  issuing.value = true;
  editError.value = "";
  try {
    const res = await $fetch<{ link: string; note: string }>(`/api/ops/experts/${current.value.expertId}/link`, { method: "POST", body: { reason: form.reason } });
    setupLink.value = { name: current.value.displayName, link: res.link, note: res.note };
  } catch (e: any) {
    editError.value = apiErrorMessage(e);
  } finally {
    issuing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <h1>先生の管理</h1>
      <p class="note">
        公開されたQ&amp;Aにコメントをお寄せいただく専門家です。担当ジャンルの質問にだけコメントできます。コメントは相談員が確認してから公開されます。
        先生は <code>/ops/expert-login</code> からログインします（相談員の入口とは別です）。
      </p>
      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <SetupLinkBox v-if="setupLink" :name="setupLink.name" :link="setupLink.link" :note="setupLink.note" @close="setupLink = null" />

      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>

      <div v-else class="table-wrap">
        <table class="list">
          <thead>
            <tr><th>表示名</th><th>資格・肩書</th><th>状態</th><th>担当ジャンル</th><th>連絡先</th><th>最終ログイン</th><th>確認待ち</th><th>公開中</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-if="rows.length === 0"><td colspan="9" class="muted">まだ先生が登録されていません。</td></tr>
            <tr v-for="r in rows" :key="r.expertId" :class="{ suspended: r.status === 'suspended' }">
              <td>{{ r.displayName }}</td>
              <td>{{ r.qualification }}</td>
              <td>
                <span v-if="r.status === 'suspended'" class="badge muted">停止</span>
                <span v-else-if="r.invited" class="badge waiting">招待中</span>
                <span v-else class="badge">有効</span>
              </td>
              <td class="wrap">{{ r.genreIds.map(genreName).join("、") || "—" }}</td>
              <td>{{ r.email ?? "—" }}</td>
              <td>{{ formatDateTime(r.lastSignInAt) }}</td>
              <td>{{ r.pending }} 件</td>
              <td>{{ r.published }} 件</td>
              <td><button class="secondary small" type="button" @click="openEdit(r)">変更</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <section v-if="current" class="panel">
        <h2>{{ current.displayName }} 先生の設定</h2>
        <div class="grid">
          <label>表示名（利用者に表示）<input v-model="form.displayName" maxlength="50" /></label>
          <label>資格・肩書（利用者に表示）<input v-model="form.qualification" maxlength="50" placeholder="例：臨床心理士、弁護士" /></label>
          <label>所属（利用者に表示）<input v-model="form.affiliation" maxlength="100" /></label>
          <label>状態
            <select v-model="form.status">
              <option value="active">有効</option>
              <option value="suspended">停止（ログイン不可。公開済みのコメントは残る）</option>
            </select>
          </label>
        </div>
        <label>紹介文（利用者に表示。1000文字以内）<textarea v-model="form.bio" rows="4" maxlength="1000" /></label>
        <fieldset class="genres">
          <legend>担当ジャンル（1つ以上）</legend>
          <label v-for="g in genres" :key="g.genreId" class="check"><input v-model="form.genreIds" type="checkbox" :value="g.genreId" />{{ g.name }}</label>
        </fieldset>
        <p class="note">担当を外しても、公開済みのコメントは残ります（新しくコメントできなくなるだけです）。</p>

        <label for="expert-reason">理由（必須）</label>
        <input id="expert-reason" v-model="form.reason" maxlength="500" placeholder="例：担当ジャンルに労務を追加" />
        <div class="row">
          <button class="secondary" type="button" @click="editing = null">閉じる</button>
          <button type="button" :disabled="saving || form.reason.trim() === '' || form.genreIds.length === 0" @click="save">{{ saving ? "保存中…" : "保存する" }}</button>
          <button v-if="current.status === 'active'" class="secondary" type="button" :disabled="issuing || form.reason.trim() === ''" @click="reissueLink">
            {{ issuing ? "発行中…" : "パスワード設定用のリンクを発行" }}
          </button>
        </div>
        <p v-if="editError" class="error" role="alert">{{ editError }}</p>
      </section>

      <section class="panel">
        <h2>先生を登録する</h2>
        <div class="grid">
          <label>メールアドレス（連絡先・ログイン用）<input v-model="invite.email" type="email" autocomplete="off" /></label>
          <label>表示名（利用者に表示）<input v-model="invite.displayName" maxlength="50" /></label>
          <label>資格・肩書（利用者に表示）<input v-model="invite.qualification" maxlength="50" placeholder="例：臨床心理士、弁護士" /></label>
          <label>所属（任意）<input v-model="invite.affiliation" maxlength="100" /></label>
        </div>
        <label>紹介文（任意。1000文字以内）<textarea v-model="invite.bio" rows="3" maxlength="1000" /></label>
        <fieldset class="genres">
          <legend>担当ジャンル（1つ以上）</legend>
          <label v-for="g in genres" :key="g.genreId" class="check"><input v-model="invite.genreIds" type="checkbox" :value="g.genreId" />{{ g.name }}</label>
        </fieldset>
        <button type="button" :disabled="inviting || !invite.email || !invite.displayName.trim() || !invite.qualification.trim() || invite.genreIds.length === 0" @click="sendInvite">
          {{ inviting ? "登録中…" : "登録して設定用のリンクを発行" }}
        </button>
        <p v-if="inviteError" class="error" role="alert">{{ inviteError }}</p>
        <p class="note">
          登録すると、パスワード設定用のリンクがこの画面に表示されます。本人に直接渡してください。本人はリンクからパスワードを設定し、続けて2段階認証（認証アプリ）を登録します。<br />
          【暫定】メールを送る仕組み（未決事項 No.59）が入るまでの運用です。報酬・掲載料などのお金に関わる機能は、法務の確認が済むまで設けません。
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 1120px; margin: 24px auto; padding: 0 24px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
.table-wrap { overflow-x: auto; }
table.list { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); font-size: 14px; }
.list th, .list td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
.list td.wrap { white-space: normal; min-width: 160px; }
.list th { background: var(--bg); color: var(--muted); font-weight: 600; }
.list tr.suspended td { color: var(--muted); }
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; max-width: 760px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 16px; }
select, textarea { width: 100%; padding: 9px 10px; font-size: 14px; border: 1px solid var(--line); border-radius: 6px; background: #fff; font-family: inherit; }
fieldset.genres { margin: 12px 0; padding: 8px 12px; border: 1px solid var(--line); border-radius: 6px; }
fieldset.genres legend { font-size: 13px; color: var(--muted); padding: 0 6px; }
label.check { display: inline-flex; align-items: center; gap: 4px; margin: 4px 14px 4px 0; font-size: 14px; }
label.check input { width: auto; margin: 0; }
.row { display: flex; gap: 8px; }
button { width: auto; padding: 8px 16px; }
button.small { margin: 0; padding: 4px 10px; font-size: 13px; }
.badge { display: inline-block; margin-left: 4px; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #ddf4ff; color: #0969da; }
.badge.waiting { background: #fff8c5; color: #7d4e00; }
.badge.muted { background: #eaeef2; color: var(--muted); }
.muted { color: var(--muted); }
</style>
