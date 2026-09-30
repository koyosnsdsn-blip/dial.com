// 質問の投稿（要件 2.5）。月額会員のみ・月3問まで。投稿ごとに使い捨ての表示IDを発行する（2.6）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const body = await readBody<{ genreId?: unknown; body?: unknown; resubmittedFrom?: unknown }>(event);
  const genreId = requireUuid(body?.genreId, "genre");
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (text.length === 0) throw createError({ statusCode: 400, statusMessage: "empty_body" });
  if (text.length > 2000) throw createError({ statusCode: 400, statusMessage: "question_too_long" });
  const from = body?.resubmittedFrom ? requireUuid(body.resubmittedFrom, "question_id") : null;

  await writeAudit(event, account, { action: "qa.post", targetType: "questions" });
  const { data, error } = await serviceDb(event).rpc("user_post_question", {
    p_account_id: account.userId,
    p_genre_id: genreId,
    p_body: text,
    p_resubmitted_from: from,
  });
  if (error) qaRpcError(error);
  return { questionId: (data as any).question_id as string, remaining: (data as any).remaining as number };
});
