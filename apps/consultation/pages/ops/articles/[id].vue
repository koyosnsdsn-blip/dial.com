<script setup lang="ts">
// 公開済みの Q&A の編集（要件 7.11.2）。匿名化の追加修正、回答の追記、非公開化・再公開、注目の設定、削除。
// 変更はすべて理由が必須で、監査ログに残る。質問文を直した場合は、前後の差分が履歴に残る
import { apiErrorMessage, formatDateTime } from "../../../ops/format";
import { useStaff } from "../../../ops/useStaff";
type Detail = {
  questionId: string;
  displayId: string | null;
  operatorCreated: boolean;
  fromCase: boolean;
  genreId: string | null;
  genres: { genreId: string; name: string }[];
  body: string;
  answer: string;
  answerUpdatedAt: string | null;
  answeredBy: string | null;
  publishedAt: string | null;
  unpublished: boolean;
  unpublishReason: string | null;
  featured: boolean;
  viewCount: number;
  edits: { before: string; after: string; editedAt: string }[];
  reports: { reason: string; reportedAt: string; resolution: string | null; note: string | null }[];
};
const staff = useStaff();
const route = useRoute();
const id = computed(() => String(route.params.id));
const detail = ref<Detail | null>(null);
const form = reactive({ body: "", answer: "", genreId: "", featured: false, reason: "" });
const loading = ref(true);
const errorMessage = ref("");
const message = ref("");
const busy = ref(false);

async function load() {
  try {
    detail.value = await $fetch<Detail>(`/api/ops/qa-articles/${id.value}`);
    Object.assign(form, { body: detail.value.body, answer: detail.value.answer, genreId: detail.value.genreId ?? "", featured: detail.value.featured, reason: "" });
    errorMessage.value = "";
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
async function patch(extra: Record<string, unknown>, done: string) {
  busy.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const res = await $fetch<{ unchanged?: boolean }>(`/api/ops/qa-articles/${id.value}`, { method: "PATCH", body: { body: form.body, answer: form.answer, genreId: form.genreId || undefined, featured: form.featured, reason: form.reason, ...extra } });
    await load();
    message.value = res.unchanged ? "変更はありませんでした。" : done;
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (!window.confirm("この記事を削除します。元に戻せません。よろしいですか？")) return;
  busy.value = true;
  try {
    await $fetch<unknown>(`/api/ops/qa-articles/${id.value}`, { method: "DELETE", query: { reason: form.reason } });
    await navigateTo("/ops/articles");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
    busy.value = false;
  }
}
const resolutionLabel: Record<string, string> = { fixed: "修正", hidden: "非公開化", dismissed: "通報却下" };
onMounted(load);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm narrow">
      <p><NuxtLink to="/ops/articles">← 公開済みの記事へ</NuxtLink></p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage && !detail" class="error" role="alert">{{ errorMessage }}</p>
      <template v-else-if="detail">
        <h1>
          記事の編集
          <span class="badge" :class="{ on: !detail.unpublished }">{{ detail.unpublished ? (detail.unpublishReason === "draft" ? "下書き" : "非公開") : "公開中" }}</span>
        </h1>
        <p class="note">
          {{ detail.operatorCreated ? (detail.fromCase ? "運営作成（相談が素材）" : "運営作成") : `投稿 ${detail.displayId ?? "（紐付け削除済み）"}` }}／公開 {{ detail.publishedAt ? formatDateTime(detail.publishedAt) : "—" }}／閲覧 {{ detail.viewCount }}／回答者 {{ detail.answeredBy ?? "—" }}（利用者には表示されません）
        </p>
        <p v-if="detail.unpublished && detail.unpublishReason && detail.unpublishReason !== 'draft'" class="warn">非公開の理由：{{ detail.unpublishReason === "auto_report" ? "通報が集中したため、自動で一時非公開になりました" : detail.unpublishReason }}</p>
        <p v-if="message" class="ok" role="status">{{ message }}</p>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

        <section class="panel">
          <label for="e-genre">ジャンル</label>
          <select id="e-genre" v-model="form.genreId">
            <option v-for="g in detail.genres" :key="g.genreId" :value="g.genreId">{{ g.name }}</option>
          </select>
          <label for="e-body">質問文（直すのは、個人が特定され得る記述の言い換えに限ります）</label>
          <textarea id="e-body" v-model="form.body" rows="7" maxlength="2000" />
          <label for="e-answer">回答文（追記・修正すると、利用者の画面に「追記・修正されました」と表示されます）</label>
          <textarea id="e-answer" v-model="form.answer" rows="10" maxlength="5000" />
          <label class="check"><input v-model="form.featured" type="checkbox" />注目の記事にする（一覧の上に表示）</label>
          <label for="e-reason">変更の理由（必須）</label>
          <input id="e-reason" v-model="form.reason" maxlength="500" />
          <div class="row">
            <button type="button" :disabled="busy || form.reason.trim() === ''" @click="patch({}, '保存しました。')">保存する</button>
            <button v-if="!detail.unpublished" class="secondary" type="button" :disabled="busy || form.reason.trim() === ''" @click="patch({ unpublished: true }, '非公開にしました。')">非公開にする</button>
            <button v-else class="secondary" type="button" :disabled="busy || form.reason.trim() === ''" @click="patch({ unpublished: false }, '公開しました。')">公開する</button>
            <button v-if="staff?.role === 'admin'" class="danger" type="button" :disabled="busy || form.reason.trim() === ''" @click="remove">削除する</button>
          </div>
          <p class="note">非公開にしても、投稿者本人は自分の投稿として確認できます。投稿者へのメール通知は、まだ行っていません。</p>
        </section>

        <section v-if="detail.edits.length" class="panel">
          <h2>質問文の修正の履歴</h2>
          <div v-for="(e, i) in detail.edits" :key="i" class="edit">
            <p class="note">{{ formatDateTime(e.editedAt) }}</p>
            <div class="two">
              <div><h3>変更前</h3><p class="pre muted">{{ e.before }}</p></div>
              <div><h3>変更後</h3><p class="pre">{{ e.after }}</p></div>
            </div>
          </div>
        </section>

        <section v-if="detail.reports.length" class="panel">
          <h2>通報</h2>
          <table class="grid">
            <thead><tr><th>日時</th><th>理由</th><th>対応</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in detail.reports" :key="i">
                <td>{{ formatDateTime(r.reportedAt) }}</td><td>{{ r.reason }}</td>
                <td>{{ r.resolution ? `${resolutionLabel[r.resolution] ?? r.resolution}：${r.note ?? ""}` : "未対応" }}</td>
              </tr>
            </tbody>
          </table>
          <p><NuxtLink to="/ops/qa-reports">通報への対応へ →</NuxtLink></p>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.edit { padding: 8px 0; border-top: 1px solid var(--line); }
</style>
