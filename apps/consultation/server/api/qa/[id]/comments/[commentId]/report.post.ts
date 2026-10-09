// 先生コメントの通報（未決事項 2.19。記事の通報 2.8 と同じ規則）。受け付けた旨だけを返し、対応の結果は通知しない（7.11.3）
// 未対応の通報が一定数（既定5件）に達したら、コメントは自動で非表示になる（DB関数 user_report_expert_comment）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const f = await featuresOf(event, account);
  if (!f.qa) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });
  const questionId = requireUuid(getRouterParam(event, "id"), "question_id");
  const commentId = requireUuid(getRouterParam(event, "commentId"), "comment_id");
  const body = await readBody<{ code?: unknown }>(event);
  if (typeof body?.code !== "string" || !(REPORT_CODES as readonly string[]).includes(body.code)) {
    throw createError({ statusCode: 400, statusMessage: "invalid_code" });
  }
  const db = serviceDb(event);
  await requirePublishedExpertComment(db, questionId, commentId);

  // 【仮】記事の通報と合わせて、同じ利用者は24時間に10件まで（濫用の抑止）
  const since = new Date(Date.now() - 86400000).toISOString();
  const [a, b] = await Promise.all([
    db.from("reports").select("report_id", { count: "exact", head: true }).eq("reporter_account_id", account.userId).gte("reported_at", since),
    db.from("expert_comment_reports").select("report_id", { count: "exact", head: true }).eq("reporter_account_id", account.userId).gte("reported_at", since),
  ]);
  if ((a.count ?? 0) + (b.count ?? 0) >= 10) throw createError({ statusCode: 429, statusMessage: "report_limit" });

  await writeAudit(event, account, { action: "qa.comment.report", targetType: "expert_comments", targetId: commentId, reason: body.code });
  const { error } = await db.rpc("user_report_expert_comment", { p_account_id: account.userId, p_comment_id: commentId, p_code: body.code });
  if (error) qaRpcError(error);
  return { reported: true };
});
