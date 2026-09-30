// 自分の投稿の削除（要件 9.3 の機能1の特則）。
//   公開済み：投稿と本人との紐付けだけを消す。Q&A の本体は残る（他の方が参考にしているため）。
//             本体の削除が必要な場合は、通報または問い合わせから申し出る
//   公開前・却下・破棄・マージ済み：本文を消して、一覧から外す。処理の記録（区分・日時）は残す
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const db = serviceDb(event);
  const { data: q, error } = await db.from("questions").select("question_id, status, hidden_at").eq("question_id", id).eq("account_id", account.userId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!q || q.hidden_at) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });

  await writeAudit(event, account, { action: "qa.delete", targetType: "questions", targetId: id, reason: q.status });
  if (q.status === "published") {
    const { error: e1 } = await db.from("questions").update({ account_id: null }).eq("question_id", id).eq("account_id", account.userId);
    if (e1) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    return { deleted: true, kept: true };
  }
  const { error: e2 } = await db.from("anonymization_edits").delete().eq("question_id", id);
  const { error: e3 } = await db.from("questions").update({ body: "（削除済み）", hidden_at: new Date().toISOString() }).eq("question_id", id).eq("account_id", account.userId);
  if (e2 || e3) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { deleted: true, kept: false };
});
