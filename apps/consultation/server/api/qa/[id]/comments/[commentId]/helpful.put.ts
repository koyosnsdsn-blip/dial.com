// 先生コメントの「参考になった」の付け外し（未決事項 2.19）。ログイン中の利用者のみ。
// 全文を読めない人（コメントが冒頭30文字に切り詰められている人）は付けられない（読んでいないコメントを評価させないため）。
// 評価の件数だけを公開し、誰が付けたかは公開しない。
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const f = await featuresOf(event, account);
  if (!f.qa) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });
  const questionId = requireUuid(getRouterParam(event, "id"), "question_id");
  const commentId = requireUuid(getRouterParam(event, "commentId"), "comment_id");
  const body = await readBody<{ on?: unknown }>(event);
  if (typeof body?.on !== "boolean") throw createError({ statusCode: 400, statusMessage: "invalid_value" });
  const db = serviceDb(event);
  await requirePublishedExpertComment(db, questionId, commentId);

  if (!f.qaFull) {
    const [reads, mine] = await Promise.all([
      db.from("qa_full_reads").select("question_id").eq("account_id", account.userId).eq("question_id", questionId).limit(1),
      db.from("questions").select("question_id").eq("question_id", questionId).eq("account_id", account.userId).limit(1),
    ]);
    if (reads.error || mine.error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    if ((reads.data ?? []).length === 0 && (mine.data ?? []).length === 0) throw createError({ statusCode: 403, statusMessage: "full_read_required" });
  }
  const { data, error } = await db.rpc("user_set_comment_helpful", { p_account_id: account.userId, p_comment_id: commentId, p_on: body.on });
  if (error) qaRpcError(error);
  return { on: Boolean((data as any)?.on), count: Number((data as any)?.count ?? 0) };
});
