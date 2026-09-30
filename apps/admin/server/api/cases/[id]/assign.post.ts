// 担当相談員の変更（要件 7.3「管理者権限による担当相談員の変更」、3.6）。運営管理者のみ。
// SLAタイマーは引継ぎ時点で再起算しない（3.6）ため、awaiting_reply_since には触れない。
// 相談者への「担当が変わりました」の通知は未実装（メール配信サービスが未決：未決事項 No.59）。
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const body = await readBody<{ counselorId?: unknown; reason?: unknown }>(event);
  const counselorId = requireUuid(body?.counselorId, "counselor_id");
  const reason = requireText(body?.reason, "reason", 500);

  const c = await requireVisibleCase(event, caseId);
  if (c.counselor_id === counselorId) return { ok: true, unchanged: true };

  const db = serviceDb(event);
  const { data: target, error: targetError } = await db
    .from("counselors")
    .select("counselor_id, status")
    .eq("counselor_id", counselorId)
    .maybeSingle();
  if (targetError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!target || target.status !== "active") {
    throw createError({ statusCode: 400, statusMessage: "invalid_counselor" });
  }

  await writeAudit(event, staff, { action: "case.assign", targetType: "cases", targetId: caseId, reason });

  const { error } = await db.from("cases").update({ counselor_id: counselorId }).eq("case_id", caseId);
  if (error) {
    console.error("[assign] update failed", error.code);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { ok: true };
});
