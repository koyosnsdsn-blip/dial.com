// 緊急対応の記録（要件 3.5(2)：検知内容、判断、実施した対応を案件に紐付けて保存する）
// 担当相談員または運営管理者のみ。記録は追記のみ（編集・削除のAPIは設けない）。
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireCaseOperator, requireText, requireVisibleCase } from "../../../../ops/cases";
import { serviceDb } from "../../../../ops/db";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const body = await readBody<{ detection?: unknown; judgment?: unknown; actionTaken?: unknown }>(event);
  const detection = requireText(body?.detection, "detection", 2000);
  const judgment = typeof body?.judgment === "string" ? body.judgment.trim().slice(0, 2000) : "";
  const actionTaken = typeof body?.actionTaken === "string" ? body.actionTaken.trim().slice(0, 2000) : "";

  const c = await requireVisibleCase(event, caseId);
  requireCaseOperator(staff, c);

  await writeAudit(event, staff, { action: "emergency.record", targetType: "cases", targetId: caseId });

  const { error } = await serviceDb(event).from("emergency_records").insert({
    case_id: caseId,
    counselor_id: staff.userId,
    detection,
    judgment: judgment || null,
    action_taken: actionTaken || null,
  });
  if (error) {
    console.error("[emergency] insert failed", error.code);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { ok: true };
});
