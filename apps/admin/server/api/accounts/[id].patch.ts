// 利用者アカウントへの措置（要件 7.12.2・6.4.6）。運営管理者のみ。理由は必須。
// 行えるのは、機能1（Q&A）への投稿機能の停止・解除と、【仮】会員区分の手動切り替え。
// 閲覧（機能1）と相談（機能2）は停止しない：投稿の反復を抑止するのが目的で、支援の経路を断つことは目的としないため。
// 【仮】会員区分の手動切り替え（無料会員 ⇔ 月額会員）：決済代行が未決（未決事項 No.6）で月額課金がまだないため、
//      動作確認と初期の運用のために、運営管理者が手で切り替えられるようにしている。決済連携ができたら廃止する。
//      企業会員（所属クライアントのあるアカウント）は対象外
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const accountId = requireUuid(getRouterParam(event, "id"), "account_id");
  const body = await readBody<{ postingSuspended?: unknown; tier?: unknown; reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const db = serviceDb(event);
  const { data: a, error } = await db.from("accounts").select("account_id, posting_suspended, deleted_at, tier, client_id").eq("account_id", accountId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!a || a.deleted_at) throw createError({ statusCode: 404, statusMessage: "not_found" });

  if (body?.tier !== undefined) {
    if (body.tier !== "free" && body.tier !== "paid") throw createError({ statusCode: 400, statusMessage: "invalid_value" });
    if (a.tier === "member" || a.client_id) throw createError({ statusCode: 409, statusMessage: "member_account" });
    if (a.tier === body.tier) return { ok: true, unchanged: true };
    await writeAudit(event, staff, { action: "account.tier.update", targetType: "accounts", targetId: accountId, reason: `${reason}（${a.tier}→${body.tier}）` });
    const { error: tierError } = await db.from("accounts").update({ tier: body.tier }).eq("account_id", accountId);
    if (tierError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    return { ok: true };
  }
  if (typeof body?.postingSuspended !== "boolean") throw createError({ statusCode: 400, statusMessage: "invalid_value" });
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
