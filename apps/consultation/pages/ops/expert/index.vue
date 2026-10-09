<script setup lang="ts">
// 先生のホーム：担当ジャンルの、公開済みの質問の一覧。コメントの状況（未記入・下書き・確認待ち・差し戻し・公開中）を併せて表示する。未決事項 2.19
import { apiErrorMessage, formatDateTime } from "../../../ops/format";
type Row = {
  questionId: string;
  displayId: string | null;
  genre: string | null;
  excerpt: string;
  publishedAt: string | null;
  commentStatus: "draft" | "pending" | "returned" | "published" | "hidden" | null;
};
const STATUS: Record<string, string> = { draft: "下書き", pending: "確認待ち", returned: "差し戻し", published: "公開中", hidden: "非表示" };
const filter = ref<"all" | "todo" | "returned">("todo");
const rows = ref<Row[]>([]);
const loading = ref(true);
const errorMessage = ref("");

async function load() {
  try {
    rows.value = await $fetch<Row[]>("/api/ops/expert/questions");
  } catch (e: any) {
    errorMessage.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
}
const shown = computed(() => {
  if (filter.value === "returned") return rows.value.filter((r) => r.commentStatus === "returned");
  if (filter.value === "todo") return rows.value.filter((r) => r.commentStatus === null || r.commentStatus === "draft" || r.commentStatus === "returned");
  return rows.value;
});
const returnedCount = computed(() => rows.value.filter((r) => r.commentStatus === "returned").length);
onMounted(load);
</script>

<template>
  <div>
    <ExpertHeader />
    <main class="page">
      <h1>コメントをお寄せいただく質問</h1>
      <p class="note">
        担当ジャンルの、公開されている質問の一覧です。コメントは、提出後に相談員が確認してから公開されます。
        個人が特定される内容や、診断・個別の法的判断にあたる断定は避け、一般的な考え方としてご記入ください。
      </p>
      <p v-if="returnedCount > 0" class="alert" role="status">差し戻されたコメントが {{ returnedCount }} 件あります。</p>

      <div class="tabs" role="tablist">
        <button type="button" :class="{ on: filter === 'todo' }" @click="filter = 'todo'">未記入・下書き・差し戻し</button>
        <button type="button" :class="{ on: filter === 'returned' }" @click="filter = 'returned'">差し戻し</button>
        <button type="button" :class="{ on: filter === 'all' }" @click="filter = 'all'">すべて</button>
      </div>

      <p v-if="loading" class="note">読み込み中…</p>
      <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-else-if="shown.length === 0" class="note">該当する質問はありません。</p>
      <ul v-else class="list">
        <li v-for="r in shown" :key="r.questionId">
          <NuxtLink :to="`/ops/expert/questions/${r.questionId}`">
            <span class="meta">
              <span v-if="r.genre" class="tag">{{ r.genre }}</span>
              <span>{{ formatDateTime(r.publishedAt) }}</span>
              <span v-if="r.displayId">投稿 {{ r.displayId }}</span>
              <span v-if="r.commentStatus" class="badge" :class="r.commentStatus">{{ STATUS[r.commentStatus] }}</span>
            </span>
            <span class="excerpt">{{ r.excerpt }}</span>
          </NuxtLink>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
.page { max-width: 880px; margin: 24px auto; padding: 0 24px; }
.alert { padding: 10px 14px; background: #fff8c5; color: #7d4e00; border-radius: 6px; }
.tabs { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.tabs button { width: auto; padding: 6px 14px; font-size: 13px; background: #fff; color: var(--fg); border: 1px solid var(--line); }
.tabs button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.list a { display: block; padding: 12px 16px; background: #fff; border: 1px solid var(--line); border-radius: 8px; color: var(--fg); text-decoration: none; }
.meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.excerpt { display: block; overflow-wrap: anywhere; }
.tag { padding: 1px 10px; background: #e9ece9; border-radius: 999px; }
.badge { padding: 1px 10px; border-radius: 999px; background: #ddf4ff; color: #0969da; }
.badge.returned { background: #ffebe9; color: #cf222e; }
.badge.pending { background: #fff8c5; color: #7d4e00; }
.badge.draft { background: #eaeef2; color: var(--muted); }
</style>
