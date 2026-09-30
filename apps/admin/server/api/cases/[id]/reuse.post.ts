// 二次利用（Q&A としての公開）への同意の依頼（要件 9.4・7.13.3）。担当相談員または運営管理者。
// - 終了した相談についてだけ依頼できる。利用者は、相談の画面で同意・不同意を答える
// - 【仮】応答の期限は30日（サービス全体設定 reuse_expire_days。未決事項 No.50）。期限を過ぎると失効し、記事化の対象にしない
// - 不同意・失効のあとは、同じ相談について再び依頼しない
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);
  const c = await requireVisibleCase(event, caseId);
  requireCaseOperator(staff, c);
  if (c.status !== "closed") throw createError({ statusCode: 409, statusMessage: "case_open" });
  const db = serviceDb(event);
  const { data: cur } = await db.from("reuse_consents").select("status").eq("case_id", caseId).maybeSingle();
  if (cur && cur.status !== "unrequested") throw createError({ statusCode: 409, statusMessage: "reuse_already_requested" });
  const { data: gone } = await db.from("deletion_requests").select("request_id").eq("target_type", "case").eq("target_id", caseId).limit(1);
  if ((gone ?? []).length) throw createError({ statusCode: 409, statusMessage: "case_deleted" });
  const days = (await getSettings(event)).reuse_expire_days!;

  await writeAudit(event, staff, { action: "reuse.request", targetType: "cases", targetId: caseId, reason });
  const now = new Date();
  const { error } = await db.from("reuse_consents").upsert(
    { case_id: caseId, status: "requested", requested_at: now.toISOString(), responded_at: null, expires_at: new Date(now.getTime() + days * 86400000).toISOString() },
    { onConflict: "case_id" },
  );
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
