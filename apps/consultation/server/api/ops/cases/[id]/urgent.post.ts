// 緊急フラグの設定・解除（要件 3.5、7.3）。
// 変更は Supabase Realtime で他の相談員・運営管理者のダッシュボードへ即時に配信される（CLAUDE.md 制約#5）。
//
// 手順：
//   1. requireStaff() で本人確認（MFA済・有効な相談員）
//   2. 本人の権限（RLS）で対象案件が見えることを確認 … 担当外の案件のフラグは変えられない
//   3. 監査ログに記録（理由つき）… 記録できなければ変更しない
//   4. service role で更新（ブラウザの権限には書き込みを付与していないため）
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { serviceDb, userDb } from "../../../../ops/db";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");

  const body = await readBody<{ urgent?: unknown; reason?: unknown }>(event);
  if (typeof body?.urgent !== "boolean") {
    throw createError({ statusCode: 400, statusMessage: "invalid_urgent" });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length === 0 || reason.length > 500) {
    throw createError({ statusCode: 400, statusMessage: "reason_required" });
  }

  const { data: visible, error } = await (await userDb(event))
    .from("cases")
    .select("case_id, urgent_flag")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!visible) throw createError({ statusCode: 404, statusMessage: "not_found" });

  await writeAudit(event, staff, {
    action: body.urgent ? "case.urgent.set" : "case.urgent.clear",
    targetType: "cases",
    targetId: caseId,
    reason,
  });

  const { error: updateError } = await serviceDb(event)
    .from("cases")
    .update({ urgent_flag: body.urgent })
    .eq("case_id", caseId);
  if (updateError) {
    console.error("[cases.urgent] update failed", updateError.code);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }

  return { caseId, urgent: body.urgent };
});
