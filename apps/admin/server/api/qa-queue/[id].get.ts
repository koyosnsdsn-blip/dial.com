// Q&A の回答・公開画面の内容（要件 7.4）。
// 返すもの：投稿の本文、似た既存Q&A、再投稿のときは元の投稿と却下の理由、
//           投稿者についての件数（直近30日の投稿数、今月の枠返却の回数、破棄の回数）。アカウントIDは返さない
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const db = serviceDb(event);
  const { data: q, error } = await db
    .from("questions")
    .select("question_id, account_id, display_id, genre_id, body, status, posted_at, resubmitted_from, hidden_at")
    .eq("question_id", id)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!q || q.hidden_at) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });

  await writeAudit(event, staff, { action: "qa.review.view", targetType: "questions", targetId: id });

  const ym = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date(q.posted_at));
  const settings = await getSettings(event);
  const [names, counts, similar, original, quota, discards] = await Promise.all([
    genreNames(event),
    recentPostCounts(event, q.account_id ? [q.account_id] : []),
    db.rpc("qa_similar", { p_text: q.body, p_limit: 5, p_exclude: id }),
    q.resubmitted_from
      ? db.from("questions").select("body, question_actions(action, reason_code, reason_text, acted_at)").eq("question_id", q.resubmitted_from).maybeSingle()
      : Promise.resolve({ data: null }),
    q.account_id ? db.from("post_quotas").select("returned").eq("account_id", q.account_id).eq("year_month", ym).maybeSingle() : Promise.resolve({ data: null }),
    q.account_id ? db.from("questions").select("question_id", { count: "exact", head: true }).eq("account_id", q.account_id).eq("status", "discarded") : Promise.resolve({ count: 0 }),
  ]);
  const origReject = ((original as any)?.data?.question_actions ?? []).find((a: any) => a.action === "reject");
  const discardCount = ((discards as any).count as number | null) ?? 0;
  return {
    questionId: q.question_id as string,
    displayId: q.display_id as string | null,
    status: q.status as string,
    genreId: q.genre_id as string | null,
    genre: q.genre_id ? names.get(q.genre_id) ?? null : null,
    body: q.body as string,
    postedAt: q.posted_at as string,
    businessDays: businessDaysSince(q.posted_at),
    recentPosts: q.account_id ? counts.get(q.account_id) ?? 1 : 0,
    // 今月の枠返却が上限に達していると、却下しても枠は戻らない（6.4.6）
    returnExhausted: (((quota as any)?.data?.returned as number | undefined) ?? 0) >= 2,
    discardCount,
    discardsUntilSuspend: Math.max(0, settings.qa_discard_suspend! - discardCount),
    original: (original as any)?.data
      ? { body: (original as any).data.body as string, reasonCode: (origReject?.reason_code as string | undefined) ?? null, reasonText: (origReject?.reason_text as string | undefined) ?? null }
      : null,
    similar: (((similar as any).data ?? []) as any[]).map((s) => ({ questionId: s.question_id as string, excerpt: Array.from(s.body as string).slice(0, 100).join("") })),
    rejectCodes: REJECT_CODES,
    discardCodes: DISCARD_CODES,
  };
});
