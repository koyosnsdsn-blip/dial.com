<script setup lang="ts">
// 二次利用同意の状況（要件 7.13.3）。運営管理者のみ。
// 依頼は、終了した相談の詳細画面から行う。利用者は相談の画面で同意・不同意を答える（メールでの依頼・督促は、配信サービスが決まってから）
type Row = { caseId: string; status: string; requestedAt: string | null; respondedAt: string | null; expiresAt: string | null; articleCreated: boolean };
const LABEL: Record<string, string> = { requested: "依頼済み（応答待ち）", agreed: "同意", declined: "不同意", expired: "期限切れ（失効）" };
const rows = ref<Row[]>([]);
const loading = ref(true);
const errorMessage = ref("");
onMounted(async () => {
  try {
    rows.value = await $fetch<Row[]>("/api/reuse-consents");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm">
      <p><NuxtLink to="/ops">← 運営メニューへ戻る</NuxtLink></p>
      <h1>二次利用同意</h1>
      <p class="note">相談の内容を、匿名化したうえで Q&amp;A の記事にする場合の、ご本人の同意の状況です。同意が得られた相談だけを、記事の作成画面で素材として選べます。不同意・失効の相談は、記事化の対象にしません。</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="rows.length === 0" class="panel note">依頼はまだありません。終了した相談の詳細画面から依頼できます。</p>
      <div v-else class="scroll">
        <table class="grid">
          <thead><tr><th>状態</th><th>相談</th><th>依頼</th><th>応答</th><th>期限</th><th>記事</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.caseId">
              <td><span class="badge" :class="{ on: r.status === 'agreed', wait: r.status === 'requested' }">{{ LABEL[r.status] ?? r.status }}</span></td>
              <td><NuxtLink :to="`/cases/${r.caseId}`">{{ shortId(r.caseId) }}</NuxtLink></td>
              <td>{{ formatDateTime(r.requestedAt) }}</td>
              <td>{{ formatDateTime(r.respondedAt) }}</td>
              <td>{{ r.status === "requested" ? formatDateTime(r.expiresAt) : "—" }}</td>
              <td><NuxtLink v-if="r.status === 'agreed' && !r.articleCreated" to="/articles/new">記事を作成する</NuxtLink><span v-else-if="r.articleCreated">作成済み</span><span v-else>—</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>
