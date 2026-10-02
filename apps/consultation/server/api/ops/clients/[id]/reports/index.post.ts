// 四半期レポートの作成・作り直し（要件 7.6.3）。運営管理者のみ。理由は必須。
// 作れるのは「直前の四半期」だけ。期中の値や任意の期間の集計は出さない（差分から相談の時期を推定されないため）。
// 通常は四半期の初日に自動で作られる。ここは、初回や、集計をやり直す必要があるときのための操作。
import { writeAudit } from "../../../../../ops/audit";
import { requireStaff } from "../../../../../ops/auth";
import { requireText } from "../../../../../ops/cases";
import { serviceDb } from "../../../../../ops/db";
import { requireUuid } from "../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  await writeAudit(event, staff, { action: "client.report.generate", targetType: "client_quarterly_reports", targetId: clientId, reason });
  const { data, error } = await serviceDb(event).rpc("system_generate_quarterly_reports", { p_quarter_start: null, p_client_id: clientId });
  if (error) {
    console.error("[report.generate] failed", error.code, error.message);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  if (!data) throw createError({ statusCode: 409, statusMessage: "report_not_available" });
  return { ok: true };
});
