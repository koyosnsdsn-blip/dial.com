// 回答を公開する（要件 6.1・7.4）。回答が入力されているときだけ公開できる。
// 本文を直した場合は、匿名化のための修正として差分を残す（6.4.2）。匿名化の確認（チェックリスト）を済ませていることが条件
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const body = await readBody<{ answer?: unknown; body?: unknown; checked?: unknown }>(event);
  const answer = requireText(body?.answer, "answer", 5000);
  if (body?.checked !== true) throw createError({ statusCode: 400, statusMessage: "checklist_not_confirmed" });
  const edited = typeof body?.body === "string" && body.body.trim() !== "" ? body.body.trim() : null;

  await writeAudit(event, staff, { action: "qa.publish", targetType: "questions", targetId: id, reason: edited ? "匿名化の修正あり" : null });
  const { data, error } = await serviceDb(event).rpc("staff_publish_question", { p_question_id: id, p_counselor_id: staff.userId, p_answer: answer, p_body: edited });
  if (error) qaRpcError(error);
  return data as { published: boolean; anonymized: boolean };
});
