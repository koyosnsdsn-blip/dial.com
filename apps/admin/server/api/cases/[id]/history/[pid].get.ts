// 過去の相談のやり取り（要件 3.9.5：サマリの根拠となった元のやり取りへ、常に遷移できること）。
// いま見えている案件と「同じ相談者」の、終了した相談だけを返す。相談内容にあたるため、返す前に監査ログを記録する
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const pastId = requireUuid(getRouterParam(event, "pid"), "case_id");
  const c = await requireVisibleCase(event, caseId);
  const db = serviceDb(event);
  const [{ data: past }, { data: gone }] = await Promise.all([
    db.from("cases").select("case_id, account_id, status").eq("case_id", pastId).maybeSingle(),
    db.from("deletion_requests").select("request_id").eq("target_type", "case").eq("target_id", pastId).limit(1),
  ]);
  if (!past || past.account_id !== c.account_id || past.status !== "closed" || (gone ?? []).length) throw createError({ statusCode: 404, statusMessage: "not_found" });

  await writeAudit(event, staff, { action: "case.history.view", targetType: "cases", targetId: pastId, reason: `案件 ${caseId} の経緯の確認` });
  const { data: messages, error } = await db.from("messages").select("message_id, sender, body, sent_at").eq("case_id", pastId).is("hidden_at", null).order("sent_at");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (messages ?? []).map((m: any) => ({ messageId: m.message_id as string, sender: m.sender as "user" | "counselor", body: m.body as string, sentAt: m.sent_at as string }));
});
