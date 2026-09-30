// 当社の判断による記事の削除（要件 7.11.2）。理由は必須。一覧・公開画面から消える（元に戻せない）。
// 【仮】本文は、この時点で「（削除済み）」に置き換える（質問・回答とも）。処理の記録は残す
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const reason = requireText(getQuery(event).reason, "reason", 500);
  const db = serviceDb(event);
  const { data: q } = await db.from("questions").select("question_id, status, hidden_at").eq("question_id", id).maybeSingle();
  if (!q || q.status !== "published" || q.hidden_at) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });

  await writeAudit(event, staff, { action: "qa.article.delete", targetType: "questions", targetId: id, reason });
  const now = new Date().toISOString();
  // 回答・修正の履歴・通報を先に片づけ、最後に質問を消す（途中で失敗したら、やり直せるように）
  const { error: e1 } = await db.from("answers").update({ body: "（削除済み）", updated_at: now }).eq("question_id", id);
  const { error: e2 } = await db.from("anonymization_edits").delete().eq("question_id", id);
  const { error: e3 } = await db.from("reports").update({ resolution: "hidden", resolved_at: now, resolved_by: staff.userId, resolution_note: "記事を削除" }).eq("question_id", id).is("resolution", null);
  if (e1 || e2 || e3) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  const { error } = await db.from("questions").update({ body: "（削除済み）", hidden_at: now, unpublished_at: now, unpublish_reason: reason, featured: false }).eq("question_id", id);
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
