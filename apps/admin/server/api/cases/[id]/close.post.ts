// 対応完了（要件 3.4.2・7.3）。担当相談員または運営管理者のみ。
// 完了の理由は必須とし、監査ログに記録する（個人課金で往復回数が残っている場合は画面側で残回数を明示して確認する）。
// 案件サマリのレビュー・確定（3.9.3）は、LLMの方式選定が未決のため未実装（未決事項 No.15）。
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const c = await requireVisibleCase(event, caseId);
  requireCaseOperator(staff, c);
  if (c.status !== "open") throw createError({ statusCode: 409, statusMessage: "case_closed" });

  await writeAudit(event, staff, { action: "case.close", targetType: "cases", targetId: caseId, reason });

  const { data, error } = await serviceDb(event).rpc("staff_close_case", { p_case_id: caseId });
  if (error) rpcError(error);
  return data as { closed: boolean; rally_used: number; rally_max: number };
});
