// 無料会員が、回答の全文を開く（月3本まで：要件 2.4）。一度開いた記事は、以後も全文を読める
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const f = await featuresOf(event, account);
  if (!f.qa) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  if (f.qaFull) return { unlocked: true, remaining: null };
  const { data, error } = await serviceDb(event).rpc("user_unlock_answer", { p_account_id: account.userId, p_question_id: id });
  if (error) qaRpcError(error);
  return { unlocked: true, remaining: (data as any).remaining as number };
});
