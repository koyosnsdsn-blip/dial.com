// 四半期レポートの一覧（要件 7.6.3）。運営管理者のみ。
// クライアント管理サイトに出るものと同じ、開示用に加工済みの値を返す（加工前の値はここでは見せない）。
import { writeAudit } from "../../../../../ops/audit";
import { requireStaff } from "../../../../../ops/auth";
import { serviceDb } from "../../../../../ops/db";
import { REPORT_COLUMNS, toReportRow } from "../../../../../ops/portal";
import { requireUuid } from "../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const { data, error } = await serviceDb(event)
    .from("client_quarterly_reports")
    .select(REPORT_COLUMNS)
    .eq("client_id", clientId)
    .order("quarter_start", { ascending: false })
    .limit(40);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  await writeAudit(event, staff, { action: "client.report.list", targetType: "client_quarterly_reports", targetId: clientId });
  return (data ?? []).map(toReportRow);
});
