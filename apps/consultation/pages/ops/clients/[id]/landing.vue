<script setup lang="ts">
// ランディングページの入稿（要件 7.8・8.6.2）。運営管理者のみ。
// クライアントから受け取った原稿を、当社が内容を確認して入稿する。クライアント側では編集できない。
// 変えられるのは、掲載コメント・社内窓口の連絡先・アクセントカラーだけ。開示範囲の説明・緊急時の案内・相談の仕様の説明は固定。
// 【仮】ロゴ画像は未対応（画像の保管先が未決：未決事項 No.81）
import { apiErrorMessage, formatDateTime } from "../../../../ops/format";
type Landing = {
  clientName: string; clientStatus: "prep" | "active" | "closed"; contractType: "corp" | "muni"; featureConsult: boolean; slaHours: number;
  comment: string; contact: string; accent: string; published: boolean; clientCode: string | null; updatedAt: string | null;
};
const ACCENTS: Record<string, { label: string; color: string }> = {
  teal: { label: "青緑（標準）", color: "#1d6b66" }, blue: { label: "青", color: "#1f5fa8" }, green: { label: "緑", color: "#2f6b2f" },
  purple: { label: "紫", color: "#6a3fa0" }, brown: { label: "茶", color: "#8a4b1f" }, navy: { label: "紺", color: "#2b3f6b" },
};
// 運営画面と相談者側は同じホストにあるため、いま開いているアドレスを使う（運営画面はブラウザ側でだけ表示する）
const USER_SITE = window.location.origin;
const route = useRoute();
const clientId = computed(() => String(route.params.id));
const data = ref<Landing | null>(null);
const form = reactive({ comment: "", contact: "", accent: "teal", published: false, reason: "" });
const checks = reactive({ disclosure: false, restrain: false, promise: false });
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref("");
const message = ref("");

async function load() {
  try {
    data.value = await $fetch<Landing>(`/api/ops/clients/${clientId.value}/landing`);
    Object.assign(form, { comment: data.value.comment, contact: data.value.contact, accent: data.value.accent, published: data.value.published, reason: "" });
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function save(reissueCode = false) {
  if (reissueCode && !window.confirm("クライアントコードを再発行します。これまでの URL は使えなくなります。よろしいですか？")) return;
  busy.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await $fetch<unknown>(`/api/ops/clients/${clientId.value}/landing`, { method: "PUT", body: { ...form, checked: checks.disclosure && checks.restrain && checks.promise, reissueCode } });
    await load();
    message.value = "保存しました。";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
const url = computed(() => (data.value?.clientCode ? `${USER_SITE}/c/${data.value.clientCode}` : ""));
const allChecked = computed(() => checks.disclosure && checks.restrain && checks.promise);
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm narrow">
      <p><NuxtLink :to="`/ops/clients/${clientId}`">← クライアントの設定へ戻る</NuxtLink></p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage && !data" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="data">
        <h1>ランディングページ　<span class="muted">{{ data.clientName }}</span> <span class="badge" :class="{ on: data.published }">{{ data.published ? "公開中" : "未公開" }}</span></h1>
        <p v-if="message" class="ok" role="status">{{ message }}</p>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

        <section class="panel">
          <h2>ページの URL</h2>
          <template v-if="url">
            <p><code>{{ url }}</code></p>
            <p class="note">
              この URL を、クライアントから所属の方へ案内してもらいます。URL は入口の案内に使うだけで、登録には招待コードが必要です。
              <template v-if="!data.published">まだ公開していないため、開くと共通の入口へ移動します。</template>
              <template v-else-if="data.clientStatus !== 'active'">クライアントが「有効」になるまで、開くと共通の入口へ移動します。</template>
            </p>
          </template>
          <p v-else class="note">最初に保存したときに、URL（推測できないランダムな文字列）が発行されます。</p>
        </section>

        <section class="panel">
          <h2>掲載する内容</h2>
          <label for="lp-comment">掲載コメント（600文字まで。クライアントからの原稿）</label>
          <textarea id="lp-comment" v-model="form.comment" rows="6" maxlength="600" :disabled="data.clientStatus === 'closed'" />
          <label for="lp-contact">社内窓口の連絡先（300文字まで）</label>
          <textarea id="lp-contact" v-model="form.contact" rows="3" maxlength="300" :disabled="data.clientStatus === 'closed'" />
          <label for="lp-accent">アクセントカラー</label>
          <select id="lp-accent" v-model="form.accent" :disabled="data.clientStatus === 'closed'">
            <option v-for="(a, key) in ACCENTS" :key="key" :value="key">{{ a.label }}</option>
          </select>
          <p class="note">文字として表示します（リンクや装飾は付きません）。ロゴ画像は、まだ対応していません。</p>
        </section>

        <section class="panel preview" :style="{ '--lp': ACCENTS[form.accent]?.color }">
          <h2>プレビュー（利用者に見える内容）</h2>
          <div class="lp">
            <p class="muted">{{ data.clientName }} のみなさまへ</p>
            <p class="lp-title">ダイヤル.com</p>
            <p>{{ data.featureConsult ? "専門の相談員に、メッセージでご相談いただけます。費用のご負担はありません。" : "お役立ていただける情報をご用意しています。" }}</p>
            <p v-if="form.comment" class="lp-box pre">{{ form.comment }}</p>
            <p class="lp-button">はじめる（招待コードを入力）</p>
            <p class="lp-box fixed">{{ data.contractType === "corp" ? "【固定】勤務先に伝わること・伝わらないこと（ご相談の内容、誰が相談・登録したかは勤務先に伝わりません ほか）" : "【固定】ご相談の内容は、委託元へそのまま報告されます" }}</p>
            <p v-if="data.featureConsult" class="lp-box fixed">【固定】ご相談について（お返事までの目安 {{ data.slaHours }}時間 ほか）</p>
            <p v-if="form.contact" class="lp-box pre"><strong>社内のお問い合わせ先</strong><br />{{ form.contact }}</p>
            <p class="lp-box fixed">【固定】お急ぎのとき・危険を感じるときの案内</p>
          </div>
        </section>

        <section v-if="data.clientStatus !== 'closed'" class="panel">
          <h2>入稿の確認</h2>
          <label class="check"><input v-model="checks.disclosure" type="checkbox" />開示範囲について、事実と違う記載がない（例：「相談内容は社内の担当部署とも共有します」は不可）</label>
          <label class="check"><input v-model="checks.restrain" type="checkbox" />利用を抑える記載がない（例：「業務時間中の利用は控えること」は不可）</label>
          <label class="check"><input v-model="checks.promise" type="checkbox" />当社の提供範囲を超える約束がない（対応時間・対応範囲など）。相談が無効のクライアントでは、相談窓口としての案内になっていない</label>
          <label class="check"><input v-model="form.published" type="checkbox" />このページを公開する</label>
          <label for="lp-reason">変更の理由（必須）</label>
          <input id="lp-reason" v-model="form.reason" maxlength="500" placeholder="例：初回の入稿" />
          <div class="row">
            <button type="button" :disabled="busy || !allChecked || form.reason.trim() === ''" @click="save(false)">保存する</button>
            <button v-if="data.clientCode" class="secondary" type="button" :disabled="busy || !allChecked || form.reason.trim() === ''" @click="save(true)">URL を再発行して保存する</button>
          </div>
          <p class="note">URL が社外に出てしまった場合は、再発行してください。再発行すると、これまでの URL は使えなくなります。<span v-if="data.updatedAt">最終更新：{{ formatDateTime(data.updatedAt) }}</span></p>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
code { padding: 4px 8px; background: var(--bg); border-radius: 4px; overflow-wrap: anywhere; }
.lp { max-width: 380px; margin: 0 auto; padding: 16px; background: #f7f5f0; border: 1px solid var(--line); border-radius: 12px; font-size: 14px; }
.lp-title { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
.lp-box { padding: 10px 12px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.lp-box.fixed { color: var(--muted); border-style: dashed; font-size: 13px; }
.lp-button { padding: 10px; text-align: center; color: #fff; font-weight: 600; background: var(--lp); border-radius: 8px; }
</style>
