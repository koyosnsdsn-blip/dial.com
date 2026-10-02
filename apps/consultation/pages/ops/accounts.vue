<script setup lang="ts">
// 利用者アカウントの照会（要件 7.12.2）。運営管理者のみ。
// 問い合わせ対応と措置（投稿機能の停止・解除）のための画面。相談内容へはここから遷移しない。
import { apiErrorMessage, formatDateTime } from "../../ops/format";
type Account = {
  accountId: string;
  email: string | null;
  nickname: string | null;
  tier: "free" | "paid" | "member";
  clientName: string | null;
  postingSuspended: boolean;
  createdAt: string;
  deleted: boolean;
  caseCount: number;
  openCaseCount: number;
  questionCount: number;
};
const tierLabel: Record<string, string> = { free: "無料会員", paid: "月額会員", member: "企業会員" };

const email = ref("");
const searching = ref(false);
const searched = ref(false);
const account = ref<Account | null>(null);
const errorMessage = ref("");
const message = ref("");

async function search() {
  searching.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const res = await $fetch<{ found: boolean; account?: Account }>("/api/ops/accounts/search", { method: "POST", body: { email: email.value } });
    account.value = res.found ? res.account ?? null : null;
    searched.value = true;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    searching.value = false;
  }
}

const reason = ref("");
const saving = ref(false);
async function setSuspended(next: boolean) {
  if (!account.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>(`/api/ops/accounts/${account.value.accountId}`, { method: "PATCH", body: { postingSuspended: next, reason: reason.value } });
    reason.value = "";
    await search();
    message.value = next ? "投稿機能を停止しました。" : "投稿機能の停止を解除しました。";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

// 【仮】会員区分の手動切り替え（決済連携ができるまでの暫定）
const tierReason = ref("");
async function setTier(next: "free" | "paid") {
  if (!account.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await $fetch<unknown>(`/api/ops/accounts/${account.value.accountId}`, { method: "PATCH", body: { tier: next, reason: tierReason.value } });
    tierReason.value = "";
    await search();
    message.value = next === "paid" ? "月額会員に切り替えました。" : "無料会員に切り替えました。";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

// 開示請求の受付（要件 7.13.2）
const disclosureNote = ref("");
const disclosureDone = ref(false);
async function createDisclosure() {
  if (!account.value) return;
  try {
    await $fetch<unknown>("/api/ops/disclosures", { method: "POST", body: { accountId: account.value.accountId, note: disclosureNote.value } });
    disclosureNote.value = "";
    disclosureDone.value = true;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  }
}
</script>

<template>
  <div>
    <StaffHeader />
    <main class="page">
      <h1>利用者アカウントの照会</h1>
      <form class="panel" @submit.prevent="search">
        <label for="email">ニックネーム または メールアドレス（完全一致）</label>
        <div class="row">
          <input id="email" v-model="email" type="text" autocomplete="off" required />
          <button type="submit" :disabled="searching || !email">{{ searching ? "検索中…" : "照会する" }}</button>
        </div>
        <p class="note">
          お名前での検索・一部分での検索はできません（利用者のお名前は保持していません）。照会したことは監査ログに記録されます。<br />
          本人確認：措置や退会の申し出は、ご本人がログインした状態での操作を原則とします（ニックネームでの登録では、メールによる確認はできません）。
        </p>
      </form>

      <p v-if="message" class="ok" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="searched && !account && !errorMessage" class="note">該当するアカウントは見つかりませんでした。</p>

      <section v-if="account" class="panel">
        <h2>{{ account.nickname ?? account.email }}</h2>
        <dl class="meta">
          <dt>会員区分</dt><dd>{{ tierLabel[account.tier] }}<span v-if="account.deleted" class="badge muted">退会済み</span></dd>
          <dt>所属クライアント</dt><dd>{{ account.clientName ?? "—" }}</dd>
          <dt>登録日</dt><dd>{{ formatDateTime(account.createdAt) }}</dd>
          <dt>相談</dt><dd>{{ account.caseCount }} 件（うち対応中 {{ account.openCaseCount }} 件）</dd>
          <dt>Q&Aへの投稿</dt><dd>{{ account.questionCount }} 件<span v-if="account.postingSuspended" class="badge waiting">投稿停止中</span></dd>
        </dl>
        <p class="note">相談の内容は、この画面からは表示しません。</p>

        <template v-if="!account.deleted">
          <h3>開示請求の受付</h3>
          <p class="note">ご本人から、保有個人データ（相談の記録など）の開示を求められたときに登録します。以後の対応は「開示請求」の画面で行います。</p>
          <label for="disc-note">受付の経緯のメモ（必須）</label>
          <input id="disc-note" v-model="disclosureNote" maxlength="1000" placeholder="例：問い合わせフォームから申し出（10/1）" />
          <button class="secondary" type="button" :disabled="saving || disclosureNote.trim() === ''" @click="createDisclosure">開示請求を受け付ける</button>
          <p v-if="disclosureDone" class="note" role="status">受け付けました。<NuxtLink to="/ops/disclosures">開示請求の画面へ</NuxtLink></p>
          <template v-if="account.tier !== 'member'">
            <h3>会員区分の切り替え（暫定）</h3>
            <p class="note">月額課金の決済がまだ無いため、動作確認と初期の運用のために、手で切り替えられるようにしています。月額会員は、Q&amp;A の全文を読め、質問を投稿できます。</p>
            <label for="tier-reason">理由（必須）</label>
            <input id="tier-reason" v-model="tierReason" maxlength="500" placeholder="例：動作確認のため" />
            <button class="secondary" type="button" :disabled="saving || tierReason.trim() === ''" @click="setTier(account.tier === 'paid' ? 'free' : 'paid')">
              {{ account.tier === "paid" ? "無料会員に戻す" : "月額会員にする" }}
            </button>
          </template>
          <h3>投稿機能の{{ account.postingSuspended ? "停止を解除する" : "停止" }}</h3>
          <p class="note">停止するのはQ&Aへの投稿だけです。Q&Aの閲覧と、相談の利用は停止しません。</p>
          <label for="reason">理由（必須）</label>
          <input id="reason" v-model="reason" maxlength="500" />
          <button type="button" :disabled="saving || reason.trim() === ''" @click="setSuspended(!account.postingSuspended)">
            {{ account.postingSuspended ? "停止を解除する" : "投稿機能を停止する" }}
          </button>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 760px; margin: 24px auto; padding: 0 24px; }
.panel { margin-top: 16px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.panel h3 { font-size: 14px; margin: 20px 0 6px; }
.row { display: flex; gap: 8px; }
.row button { margin-top: 0; width: auto; white-space: nowrap; }
button { width: auto; padding: 8px 16px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
.meta { display: grid; grid-template-columns: 9em 1fr; gap: 4px 12px; font-size: 14px; margin: 8px 0; }
.meta dt { color: var(--muted); }
.meta dd { margin: 0; }
.badge { display: inline-block; margin-left: 8px; padding: 2px 8px; font-size: 12px; border-radius: 10px; background: #eaeef2; color: var(--muted); }
.badge.waiting { background: #fff8c5; color: #7d4e00; }
</style>
