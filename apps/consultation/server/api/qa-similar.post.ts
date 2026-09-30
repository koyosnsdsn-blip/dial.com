// 投稿の前に、似た質問を提示する（要件 2.7）。投稿できる利用者だけが使う
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const f = await featuresOf(event, account);
  if (!f.qaPost) throw createError({ statusCode: 403, statusMessage: "qa_not_eligible" });
  const body = await readBody<{ text?: unknown }>(event);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (text.length < 10) return { items: [] };
  const { data, error } = await serviceDb(event).rpc("qa_similar", { p_text: text, p_limit: 3, p_exclude: null });
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return { items: ((data ?? []) as any[]).map((r) => ({ questionId: r.question_id as string, question: preview(r.body, 80) })) };
});
