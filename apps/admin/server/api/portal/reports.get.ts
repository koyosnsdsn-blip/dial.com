// クライアント管理サイト：四半期レポート（要件 7.6.3）。
// 本人の権限で読む（RLS：多要素認証を通過した、自クライアントの有効な管理者だけが、自クライアントの行を読める）。
// service role は使わない。サーバー側の実装を誤っても、他のクライアントの行は DB が返さない。
export default defineEventHandler(async (event) => {
  const admin = await requireClientAdmin(event);
  await writePortalAudit(event, admin, { action: "portal.report.view", targetType: "client_quarterly_reports", targetId: admin.clientId });
  const { data, error } = await (await userDb(event))
    .from("client_quarterly_reports")
    .select(REPORT_COLUMNS)
    .order("quarter_start", { ascending: false })
    .limit(40);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (data ?? []).map(toReportRow);
});
