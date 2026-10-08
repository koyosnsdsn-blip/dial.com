<script setup lang="ts">
// 契約クライアントの設定画面：クライアント管理サイトのIP許可リスト（要件 8.8.1・8.8.3。未決事項一覧 2.18）。運営管理者のみ。
// 登録すると、このクライアントの管理者は、登録した接続元からしかクライアント管理サイトを使えない。空にすると制限なし。
// 所属者（相談者）の相談には影響しない（8.6.4）。設定は当社が行い、クライアント管理サイトからは変更できない。
import { apiErrorMessage } from "../ops/format";
import { parseCidr } from "../utils/ipCidr";

const props = defineProps<{ clientId: string; contractType: "corp" | "muni" }>();
const items = ref<{ cidr: string; note: string | null }[]>([]);
const text = ref("");
const reason = ref("");
const loading = ref(true);
const busy = ref(false);
const message = ref("");
const errorMessage = ref("");

// 1行に1件。「203.0.113.0/24 本社」のように、空白のあとはメモとして扱う
const parsed = computed(() =>
  text.value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((l) => {
      const [cidr, ...rest] = l.split(/\s+/);
      return { line: l, cidr, note: rest.join(" ") || null, ok: parseCidr(cidr) !== null };
    }),
);
const invalid = computed(() => parsed.value.filter((p) => !p.ok));

async function load() {
  try {
    const res = await $fetch<{ items: { cidr: string; note: string | null }[] }>(`/api/ops/clients/${props.clientId}/ip-allowlist`);
    items.value = res.items;
    text.value = res.items.map((i) => (i.note ? `${i.cidr} ${i.note}` : i.cidr)).join("\n");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function save() {
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    await $fetch<unknown>(`/api/ops/clients/${props.clientId}/ip-allowlist`, {
      method: "PUT",
      body: { items: parsed.value.map((p) => ({ cidr: p.cidr, note: p.note })), reason: reason.value },
    });
    reason.value = "";
    await load();
    message.value = items.value.length ? `保存しました（${items.value.length}件）。反映まで最大30秒かかります。` : "保存しました。制限なし（未設定）になりました。";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <section class="panel">
    <h2>クライアント管理サイトのIP許可リスト</h2>
    <p class="note">
      登録すると、このクライアントの管理者は、<strong>登録した接続元からしか</strong>クライアント管理サイトを使えなくなります。空にすると制限しません（未設定）。<br />
      <strong>所属者（相談者）の相談には影響しません。</strong>職場からしか相談できない構成は採りません（要件 8.6.4）。管理サイトは業務利用のため別扱いです。
    </p>
    <p v-if="contractType === 'muni'" class="notice">自治体委託型は相談記録の逐語全文を閲覧できるため、設定を推奨します（8.8.3）。</p>
    <p class="note">
      現在：<strong>{{ loading ? "読み込み中…" : items.length ? `${items.length}件で制限中` : "未設定（制限なし）" }}</strong><br />
      クライアントから、社内ネットワークの固定IPアドレス（グローバルIP）を書面などで受け取って登録してください。1行に1件、空白のあとはメモになります。
    </p>
    <textarea v-model="text" rows="5" placeholder="203.0.113.0/24 本社&#10;198.51.100.10 大阪支店" />
    <p v-if="invalid.length" class="error">形式が正しくない行があります：{{ invalid.map((p) => p.line).join("、") }}（範囲は末尾を0にしてください）</p>
    <label :for="`ipallow-reason-${clientId}`">理由（必須）</label>
    <input :id="`ipallow-reason-${clientId}`" v-model="reason" maxlength="500" placeholder="例：クライアントからの依頼（2026-10-08 書面受領）" />
    <p v-if="message" class="ok" role="status">{{ message }}</p>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <button type="button" :disabled="busy || loading || invalid.length > 0 || reason.trim() === ''" @click="save">保存する</button>
  </section>
</template>

<style scoped>
.panel { margin-top: 20px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 8px; }
.panel h2 { font-size: 16px; margin: 0 0 8px; }
.ok { padding: 10px 14px; background: #dafbe1; color: #1a7f37; border-radius: 6px; }
textarea { width: 100%; font-family: ui-monospace, monospace; font-size: 14px; padding: 8px; border: 1px solid var(--line); border-radius: 6px; }
button { width: auto; padding: 8px 16px; }
</style>
