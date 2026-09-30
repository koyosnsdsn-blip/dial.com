// Q&A の一覧・検索（要件 2.3・2.4）。ログインしていなくても見られる。
// 一覧では、質問の冒頭と、回答の冒頭30文字だけを返す（全文は詳細で、会員区分に応じて返す）。
// 【仮】検索は部分一致（質問文と回答文）。全文検索エンジンの採用は未定
export default defineEventHandler(async (event) => {
  const account = await optionalAccount(event);
  const f = await featuresOf(event, account);
  if (!f.qa) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });

  const q = getQuery(event);
  const keyword = cleanKeyword(q.q);
  const genre = typeof q.genre === "string" && q.genre ? requireUuid(q.genre, "genre") : null;
  const page = Math.max(1, Math.min(500, Number(q.page) || 1));
  const size = 20;
  const db = serviceDb(event);

  const { data: genres, error: genreError } = await db.from("genres").select("genre_id, name").order("sort_order");
  if (genreError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  let ids: string[] | null = null;
  if (keyword) {
    const [inQ, inA] = await Promise.all([
      publicQuestions(db, "question_id").ilike("body", `%${keyword}%`).limit(300),
      db.from("answers").select("question_id").ilike("body", `%${keyword}%`).limit(300),
    ]);
    if (inQ.error || inA.error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    ids = [...new Set([...(inQ.data ?? []).map((r: any) => r.question_id as string), ...(inA.data ?? []).map((r: any) => r.question_id as string)])];
    if (ids.length === 0) return { genres: genreList(genres), items: [], total: 0, page, size, features: f };
  }

  let request = publicQuestions(db, "question_id, display_id, operator_created, genre_id, body, published_at, featured, answers(body)")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (genre) request = request.eq("genre_id", genre);
  if (ids) request = request.in("question_id", ids);
  const { data, error, count } = await request;
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const names = new Map((genres ?? []).map((g: any) => [g.genre_id as string, g.name as string]));
  return {
    genres: genreList(genres),
    total: count ?? 0,
    page,
    size,
    features: f,
    items: ((data ?? []) as any[]).map((r) => ({
      questionId: r.question_id as string,
      displayId: (r.display_id as string | null) ?? null,
      operatorCreated: Boolean(r.operator_created),
      genre: r.genre_id ? names.get(r.genre_id) ?? null : null,
      question: preview(r.body, 120),
      questionCut: Array.from(r.body as string).length > 120,
      answerPreview: preview(r.answers?.[0]?.body ?? "", ANSWER_PREVIEW),
      publishedAt: r.published_at as string | null,
      featured: Boolean(r.featured),
    })),
  };
});

function genreList(genres: any[] | null) {
  return (genres ?? []).map((g) => ({ genreId: g.genre_id as string, name: g.name as string }));
}
