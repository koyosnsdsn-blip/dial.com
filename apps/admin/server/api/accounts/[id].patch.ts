// 利用者アカウントへの措置（要件 7.12.2・6.4.6）。運営管理者のみ。理由は必須。
// 行えるのは、機能1（Q&A）への投稿機能の停止・解除のみ。
// 閲覧（機能1）と相談（機能2）は停止しない：投稿の反復を抑止するのが目的で、支援の経路を断つことは目的としないため。
// 未実装：退会処理（10.3.3・9.3 の削除ポリシーと猶予期間が未決：未決事項 No.9）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const accountId = requireUuid(getRouterParam(event, "id"), "account_id");
  const body = await readBody<{ postingSuspended?: unknown; reason?: unknown }>(event);
  if (typeof body?.postingSuspended !== "boolean") throw createError({ statusCode: 400, statusMessage: "invalid_value" });
  const reason = requireText(body?.reason, "reason", 500);

  const db = serviceDb(event);
  const { data: a, error } = await db.from("accounts").select("account_id, posting_suspended, deleted_at").eq("account_id", accountId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!a || a.deleted_at) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (a.posting_suspended === body.postingSuspended) return { ok: true, unchanged: true };

  await writeAudit(event, staff, {
    action: body.postingSuspended ? "account.posting.suspend" : "account.posting.resume",
    targetType: "accounts",
    targetId: accountId,
    reason,
  });
  const { error: updateError } = await db.from("accounts").update({ posting_suspended: body.postingSuspended }).eq("account_id", accountId);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
