// 公開済みの Q&A の管理一覧（要件 7.11.2）。ジャンル・状態で絞り込み、公開日・閲覧数・通報件数で並べ替える
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
import { chunks, genreNames } from "../../../ops/qa";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  await requireStaff(event);
  const q = getQuery(event);
  const db = serviceDb(event);
  const sort = q.sort === "views" ? "view_count" : "published_at";
  let request = db
    .from("questions")
    .select("question_id, display_id, operator_created, genre_id, body, published_at, unpublished_at, unpublish_reason, featured, view_count, source_case_id", { count: "exact" })
    .eq("status", "published")
    .is("hidden_at", null)
    .order(sort, { ascending: false })
    .limit(300);
  if (typeof q.genre === "string" && q.genre) request = request.eq("genre_id", requireUuid(q.genre, "genre"));
  if (q.state === "public") request = request.is("unpublished_at", null);
  if (q.state === "unpublished") request = request.not("unpublished_at", "is", null);
  if (typeof q.q === "string" && q.q.trim()) request = request.ilike("body", `%${q.q.replace(/[%_,()\\*"']/g, " ").trim().slice(0, 50)}%`);
  const { data, error, count } = await request;
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const rows = (data ?? []) as any[];
  const ids = rows.map((r) => r.question_id as string);
  const reportCount = new Map<string, number>();
  for (const part of chunks(ids)) {
    const { data: reps, error: repError } = await db.from("reports").select("question_id").in("question_id", part).is("resolution", null);
    if (repError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const r of reps ?? []) reportCount.set(r.question_id, (reportCount.get(r.question_id) ?? 0) + 1);
  }
  const names = await genreNames(event);
  let items = rows.map((r) => ({
    questionId: r.question_id as string,
    displayId: r.display_id as string | null,
    operatorCreated: Boolean(r.operator_created),
    fromCase: Boolean(r.source_case_id),
    genre: r.genre_id ? names.get(r.genre_id) ?? null : null,
    excerpt: Array.from(r.body as string).slice(0, 80).join(""),
    publishedAt: r.published_at as string | null,
    unpublished: Boolean(r.unpublished_at),
    unpublishReason: r.unpublish_reason as string | null,
    featured: Boolean(r.featured),
    viewCount: r.view_count as number,
    openReports: reportCount.get(r.question_id) ?? 0,
  }));
  if (q.sort === "reports") items = items.sort((a, b) => b.openReports - a.openReports);
  return { total: count ?? 0, genres: [...names].map(([genreId, name]) => ({ genreId, name })), items };
});
