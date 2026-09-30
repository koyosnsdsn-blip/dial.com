// 往復回数の上限の調整（要件 7.3「＋／−」、3.2.5）。理由は必須で、変更履歴（rally_adjustments）と監査ログに残す。
// 使用済みの回数を下回る上限にはできない。
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const body = await readBody<{ delta?: unknown; reason?: unknown }>(event);
  if (body?.delta !== 1 && body?.delta !== -1) {
    throw createError({ statusCode: 400, statusMessage: "invalid_delta" });
  }
  const reason = requireText(body.reason, "reason", 500);

  const c = await requireVisibleCase(event, caseId);
  requireCaseOperator(staff, c);

  await writeAudit(event, staff, {
    action: body.delta > 0 ? "case.rally.increase" : "case.rally.decrease",
    targetType: "cases",
    targetId: caseId,
    reason,
  });

  const { data, error } = await serviceDb(event).rpc("staff_adjust_rally", {
    p_case_id: caseId,
    p_delta: body.delta,
    p_reason: reason,
    p_counselor_id: staff.userId,
  });
  if (error) rpcError(error);
  return data as { rally_used: number; rally_max: number };
});
