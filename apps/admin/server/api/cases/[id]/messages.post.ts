// 相談員の返信（要件 7.3・3.3）
// - 担当相談員または運営管理者のみ
// - 1往復＝相談員の返信1回。上限に達した返信で案件は自動的にクローズする（要件 3.2.5）
// - 記録→送信の順（監査ログに記録できなければ送信しない）
// - 相談者へのメール通知は未実装（メール配信サービスの選定が未決：未決事項 No.59）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const body = await readBody<{ body?: unknown }>(event);
  const text = requireText(body?.body, "body", 5000);

  const c = await requireVisibleCase(event, caseId);
  requireCaseOperator(staff, c);
  if (c.status !== "open") throw createError({ statusCode: 409, statusMessage: "case_closed" });

  await writeAudit(event, staff, { action: "message.send", targetType: "cases", targetId: caseId });

  const { data, error } = await serviceDb(event).rpc("staff_send_reply", { p_case_id: caseId, p_body: text });
  if (error) rpcError(error);
  return data as { message_id: string; rally_used: number; rally_max: number; closed: boolean };
});
