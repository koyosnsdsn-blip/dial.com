// 四半期レポートの作成・作り直し（要件 7.6.3）。運営管理者のみ。理由は必須。
// 通常のクライアント：作れるのは「直前の四半期」だけ。期中の値や任意の期間の集計は出さない（差分から相談の時期を推定されないため）。
// 通常は四半期の初日に自動で作られる。ここは、初回や、集計をやり直す必要があるときのための操作。
// テスト用のクライアント（is_test）：動作確認のため、四半期（quarter＝四半期の開始日 YYYY-MM-DD）を選んで作れる。
//   期中の四半期も作れる。集計のロジックは自動生成と同じ関数（DB の system_generate_quarterly_reports_core）で、
//   通常のクライアントには期中の四半期を作れない（DB 側でも拒否される）。
import { writeAudit } from "../../../../../ops/audit";
import { requireStaff } from "../../../../../ops/auth";
import { requireText } from "../../../../../ops/cases";
import { serviceDb } from "../../../../../ops/db";
import { requireUuid } from "../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const body = await readBody<{ reason?: unknown; quarter?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const db = serviceDb(event);
  const { data: client, error: clientError } = await db.from("clients").select("is_test").eq("client_id", clientId).maybeSingle();
  if (clientError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!client) throw createError({ statusCode: 404, statusMessage: "not_found" });

  // 四半期の指定はテスト用のクライアントだけ。四半期の開始日（1・4・7・10月の1日）であること
  let quarter: string | null = null;
  if (body?.quarter !== undefined && body.quarter !== null && body.quarter !== "") {
    if (!client.is_test) throw createError({ statusCode: 400, statusMessage: "quarter_not_allowed" });
    if (typeof body.quarter !== "string" || !/^\d{4}-(01|04|07|10)-01$/.test(body.quarter)) {
      throw createError({ statusCode: 400, statusMessage: "invalid_quarter" });
    }
    quarter = body.quarter;
  }

  await writeAudit(event, staff, {
    action: "client.report.generate",
    targetType: "client_quarterly_reports",
    targetId: clientId,
    reason: quarter ? `${reason}（テスト用クライアント／${quarter} 開始の四半期）` : reason,
  });
  const { data, error } = await db.rpc("system_generate_quarterly_reports_core", {
    p_quarter_start: quarter,
    p_client_id: clientId,
    p_allow_unfinished: Boolean(client.is_test && quarter),
  });
  if (error) {
    console.error("[report.generate] failed", error.code, error.message);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  if (!data) throw createError({ statusCode: 409, statusMessage: "report_not_available" });
  return { ok: true };
});
