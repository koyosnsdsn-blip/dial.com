// 却下（要件 6.4.3・7.4）。区分 B / E / F の選択が必須。投稿枠を返す（月2回まで）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const body = await readBody<{ code?: unknown; text?: unknown }>(event);
  if (typeof body?.code !== "string" || !(body.code in REJECT_CODES)) throw createError({ statusCode: 400, statusMessage: "invalid_code" });
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1000) : "";

  await writeAudit(event, staff, { action: "qa.reject", targetType: "questions", targetId: id, reason: body.code });
  const { data, error } = await serviceDb(event).rpc("staff_reject_question", { p_question_id: id, p_counselor_id: staff.userId, p_code: body.code, p_text: text });
  if (error) qaRpcError(error);
  return data as { rejected: boolean; quota_returned: boolean };
});
