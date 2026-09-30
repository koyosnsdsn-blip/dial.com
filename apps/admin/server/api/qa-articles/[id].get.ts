// 公開済みの Q&A の詳細（管理用。要件 7.11.2）。匿名化の修正の履歴と、処理の記録も返す
export default defineEventHandler(async (event) => {
  await requireStaff(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const db = serviceDb(event);
  const { data: q, error } = await db
    .from("questions")
    .select("question_id, display_id, operator_created, genre_id, body, status, published_at, unpublished_at, unpublish_reason, featured, view_count, hidden_at, source_case_id, answers(answer_id, body, updated_at, counselor:counselors(name)), anonymization_edits(before_text, after_text, edited_at), question_actions(action, reason_code, reason_text, acted_at)")
    .eq("question_id", id)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!q || (q as any).status !== "published" || (q as any).hidden_at) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });
  const r = q as any;
  const [{ data: reports }, names] = await Promise.all([
    db.from("reports").select("reason_code, reported_at, resolution, resolved_at, resolution_note").eq("question_id", id).order("reported_at", { ascending: false }).limit(100),
    genreNames(event),
  ]);
  return {
    questionId: r.question_id as string,
    displayId: r.display_id as string | null,
    operatorCreated: Boolean(r.operator_created),
    fromCase: Boolean(r.source_case_id),
    genreId: r.genre_id as string | null,
    genres: [...names].map(([genreId, name]) => ({ genreId, name })),
    body: r.body as string,
    answer: (r.answers?.[0]?.body as string | undefined) ?? "",
    answerUpdatedAt: (r.answers?.[0]?.updated_at as string | null) ?? null,
    // 回答者の氏名は、運営側の画面には表示してよい（3.6.1）
    answeredBy: (r.answers?.[0]?.counselor?.name as string | undefined) ?? null,
    publishedAt: r.published_at as string | null,
    unpublished: Boolean(r.unpublished_at),
    unpublishReason: r.unpublish_reason as string | null,
    featured: Boolean(r.featured),
    viewCount: r.view_count as number,
    edits: ((r.anonymization_edits ?? []) as any[]).map((e) => ({ before: e.before_text as string, after: e.after_text as string, editedAt: e.edited_at as string })).sort((a, b) => b.editedAt.localeCompare(a.editedAt)),
    reports: (reports ?? []).map((x: any) => ({ reason: REPORT_REASONS[x.reason_code] ?? x.reason_code, reportedAt: x.reported_at as string, resolution: x.resolution as string | null, note: x.resolution_note as string | null })),
  };
});
