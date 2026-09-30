// 投稿履歴の例外開示（要件 2.6・7.5）。運営管理者のみ。理由の入力が必須で、監査ログの重点監視の対象。
// 通常の対応では、投稿者の過去の投稿は見せない。短期間に内容が切迫していくような場合に限って使う
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);
  const db = serviceDb(event);
  const { data: q, error } = await db.from("questions").select("account_id").eq("question_id", id).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!q) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });

  await writeAudit(event, staff, { action: "qa.history.disclose", targetType: "questions", targetId: id, reason });
  if (!q.account_id) return { items: [] };
  const { data, error: listError } = await db
    .from("questions")
    .select("question_id, display_id, body, status, posted_at")
    .eq("account_id", q.account_id)
    .neq("question_id", id)
    .is("hidden_at", null)
    .order("posted_at", { ascending: false })
    .limit(50);
  if (listError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return {
    items: (data ?? []).map((r: any) => ({
      questionId: r.question_id as string,
      displayId: r.display_id as string | null,
      body: r.body as string,
      status: r.status as string,
      postedAt: r.posted_at as string,
    })),
  };
});
