<script setup lang="ts">
// 動画の一覧（要件 7.7.1）。運営管理者のみ
type Video = { videoId: string; title: string; category: string | null; durationSec: number | null; scopePersonal: string; scopeBusiness: string; clientCount: number; status: "draft" | "scheduled" | "published"; publishedAt: string | null; sortOrder: number; views: number };
const PERSONAL: Record<string, string> = { free: "無料会員以上", paid: "月額会員のみ", none: "対象外" };
const BUSINESS: Record<string, string> = { all: "全クライアント", some: "選択したクライアント", none: "対象外" };
const STATUS: Record<string, string> = { draft: "下書き", scheduled: "予約", published: "公開中" };
const rows = ref<Video[]>([]);
const filter = reactive({ status: "", scope: "" });
const loading = ref(true);
const errorMessage = ref("");
onMounted(async () => {
  try {
    rows.value = await $fetch<Video[]>("/api/videos");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
});
const shown = computed(() =>
  rows.value.filter((v) => (!filter.status || v.status === filter.status) && (!filter.scope || (filter.scope === "personal" ? v.scopePersonal !== "none" : v.scopeBusiness !== "none"))),
);
</script>

<template>
  <div>
    <StaffHeader />
    <main class="adm">
      <p><NuxtLink to="/ops">← 運営メニューへ戻る</NuxtLink></p>
      <h1>動画</h1>
      <div class="row">
        <select v-model="filter.status" style="width: auto" aria-label="公開状態">
          <option value="">すべての状態</option>
          <option value="published">公開中</option>
          <option value="scheduled">予約</option>
          <option value="draft">下書き</option>
        </select>
        <select v-model="filter.scope" style="width: auto" aria-label="配信範囲">
          <option value="">すべての配信範囲</option>
          <option value="personal">個人利用者が対象</option>
          <option value="business">企業会員が対象</option>
        </select>
        <NuxtLink to="/videos/new">＋ 動画を登録する</NuxtLink>
      </div>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="shown.length === 0" class="panel note">該当する動画はありません。</p>
      <div v-else class="scroll" style="margin-top: 12px">
        <table class="grid">
          <thead><tr><th>状態</th><th>タイトル</th><th>カテゴリ</th><th>配信範囲（個人）</th><th>配信範囲（企業）</th><th>公開日</th><th>視聴</th><th>順</th></tr></thead>
          <tbody>
            <tr v-for="v in shown" :key="v.videoId">
              <td><span class="badge" :class="{ on: v.status === 'published', wait: v.status === 'scheduled' }">{{ STATUS[v.status] }}</span></td>
              <td><NuxtLink :to="`/videos/${v.videoId}`">{{ v.title }}</NuxtLink></td>
              <td>{{ v.category ?? "—" }}</td>
              <td>{{ PERSONAL[v.scopePersonal] }}</td>
              <td>{{ BUSINESS[v.scopeBusiness] }}<template v-if="v.scopeBusiness === 'some'">（{{ v.clientCount }}社）</template></td>
              <td>{{ v.publishedAt ? formatDateTime(v.publishedAt) : "—" }}</td>
              <td>{{ v.views }}</td>
              <td>{{ v.sortOrder }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">視聴数は、利用者が動画の画面を開いた回数です。誰が視聴したかは、クライアントへ開示しません。</p>
    </main>
  </div>
</template>
