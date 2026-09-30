// 公開済みの Q&A の編集（要件 7.11.2）。理由は必須で、監査ログに残す。
//   本文の修正（匿名化の追加修正）… 差分を anonymization_edits に残す
//   回答の追記・修正 … answers.updated_at を更新する（利用者の画面に「追記・修正されました」と出る）
//   ジャンルの変更、注目記事の設定、非公開化・再公開
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const body = await readBody<{ body?: unknown; answer?: unknown; genreId?: unknown; featured?: unknown; unpublished?: unknown; reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);
  const db = serviceDb(event);
  const { data: q, error } = await db.from("questions").select("question_id, body, genre_id, featured, unpublished_at, status, hidden_at, answers(answer_id, body)").eq("question_id", id).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!q || (q as any).status !== "published" || (q as any).hidden_at) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });
  const cur = q as any;

  const patch: Record<string, unknown> = {};
  const changed: string[] = [];
  let newBody: string | null = null;
  if (typeof body?.body === "string" && body.body.trim() !== "" && body.body.trim() !== cur.body) {
    newBody = body.body.trim();
    if (newBody.length > 2000) throw createError({ statusCode: 400, statusMessage: "qa_too_long" });
    patch.body = newBody;
    changed.push("質問文");
  }
  if (body?.genreId !== undefined && body.genreId !== cur.genre_id) {
    const genreId = requireUuid(body.genreId, "genre");
    const { data: g } = await db.from("genres").select("genre_id").eq("genre_id", genreId).maybeSingle();
    if (!g) throw createError({ statusCode: 400, statusMessage: "invalid_genre" });
    patch.genre_id = genreId;
    changed.push("ジャンル");
  }
  if (typeof body?.featured === "boolean" && body.featured !== cur.featured) {
    patch.featured = body.featured;
    changed.push(body.featured ? "注目に設定" : "注目を解除");
  }
  if (typeof body?.unpublished === "boolean" && body.unpublished !== Boolean(cur.unpublished_at)) {
    patch.unpublished_at = body.unpublished ? new Date().toISOString() : null;
    patch.unpublish_reason = body.unpublished ? reason : null;
    changed.push(body.unpublished ? "非公開化" : "再公開");
  }
  let newAnswer: string | null = null;
  if (typeof body?.answer === "string" && body.answer.trim() !== "" && body.answer.trim() !== (cur.answers?.[0]?.body ?? "")) {
    newAnswer = body.answer.trim();
    if (newAnswer.length > 5000) throw createError({ statusCode: 400, statusMessage: "qa_too_long" });
    changed.push("回答");
  }
  if (changed.length === 0) return { ok: true, unchanged: true };

  await writeAudit(event, staff, { action: "qa.article.update", targetType: "questions", targetId: id, reason: `${reason}（${changed.join("、")}）`.slice(0, 2000) });
  if (newBody) {
    const { error: e1 } = await db.from("anonymization_edits").insert({ question_id: id, before_text: cur.body, after_text: newBody, counselor_id: staff.userId });
    if (e1) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    await db.from("question_actions").insert({ question_id: id, action: "anonymize", counselor_id: staff.userId, reason_text: reason });
  }
  if (Object.keys(patch).length) {
    const { error: e2 } = await db.from("questions").update(patch).eq("question_id", id);
    if (e2) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  if (newAnswer && cur.answers?.[0]) {
    const { error: e3 } = await db.from("answers").update({ body: newAnswer, updated_at: new Date().toISOString() }).eq("answer_id", cur.answers[0].answer_id);
    if (e3) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { ok: true };
});
