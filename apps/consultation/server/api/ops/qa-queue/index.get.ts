// Q&A の回答待ち一覧（要件 7.4）。投稿日時の古い順。相談員・運営管理者。
// 投稿者は使い捨ての表示IDだけを返す。同じ投稿者の短期間の複数投稿は、件数のバッジだけを返す（2.6）
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
import { businessDaysSince, genreNames, recentPostCounts } from "../../../ops/qa";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  await requireStaff(event);
  const q = getQuery(event);
  const db = serviceDb(event);
  let request = db
    .from("questions")
    .select("question_id, account_id, display_id, genre_id, body, posted_at, resubmitted_from")
    .eq("status", "pending")
    .is("hidden_at", null)
    .order("posted_at", { ascending: true })
    .limit(300);
  if (typeof q.genre === "string" && q.genre) request = request.eq("genre_id", requireUuid(q.genre, "genre"));
  const { data, error } = await request;
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const rows = (data ?? []) as any[];
  const [names, counts] = await Promise.all([genreNames(event), recentPostCounts(event, rows.map((r) => r.account_id))]);
  return {
    genres: [...names].map(([genreId, name]) => ({ genreId, name })),
    items: rows.map((r) => ({
      questionId: r.question_id as string,
      displayId: r.display_id as string | null,
      genre: r.genre_id ? names.get(r.genre_id) ?? null : null,
      excerpt: Array.from(r.body as string).slice(0, 80).join(""),
      postedAt: r.posted_at as string,
      businessDays: businessDaysSince(r.posted_at),
      recentPosts: r.account_id ? counts.get(r.account_id) ?? 1 : 0,
      resubmitted: Boolean(r.resubmitted_from),
    })),
  };
});
