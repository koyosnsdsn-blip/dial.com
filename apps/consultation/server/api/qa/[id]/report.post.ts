// 公開中のQ&Aの通報（要件 2.8）。通報を受け付けた旨だけを返し、対応の結果は通知しない（7.11.3）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const f = await featuresOf(event, account);
  if (!f.qa) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const body = await readBody<{ code?: unknown }>(event);
  if (typeof body?.code !== "string" || !(REPORT_CODES as readonly string[]).includes(body.code)) {
    throw createError({ statusCode: 400, statusMessage: "invalid_code" });
  }
  // 【仮】同じ利用者の通報は24時間に10件まで（濫用の抑止）
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await serviceDb(event).from("reports").select("report_id", { count: "exact", head: true }).eq("reporter_account_id", account.userId).gte("reported_at", since);
  if ((count ?? 0) >= 10) throw createError({ statusCode: 429, statusMessage: "report_limit" });

  await writeAudit(event, account, { action: "qa.report", targetType: "questions", targetId: id, reason: body.code });
  const { error } = await serviceDb(event).rpc("user_report_question", { p_account_id: account.userId, p_question_id: id, p_code: body.code });
  if (error) qaRpcError(error);
  return { reported: true };
});
