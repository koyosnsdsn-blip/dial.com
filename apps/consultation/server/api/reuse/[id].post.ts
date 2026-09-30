// 二次利用への同意・不同意（要件 9.4）。同意しなくても、ご相談への対応は変わらない
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const body = await readBody<{ agree?: unknown }>(event);
  if (typeof body?.agree !== "boolean") throw createError({ statusCode: 400, statusMessage: "invalid_answer" });
  await requireOwnCase(event, account, caseId);
  await writeAudit(event, account, { action: body.agree ? "reuse.agree" : "reuse.decline", targetType: "cases", targetId: caseId });
  const { data, error } = await serviceDb(event).rpc("user_answer_reuse", { p_account_id: account.userId, p_case_id: caseId, p_agree: body.agree });
  if (error) rpcError(error);
  return { status: (data as any).status as string };
});
