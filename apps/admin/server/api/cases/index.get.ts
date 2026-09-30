// 案件一覧（ダッシュボード 要件 7.1）。
// - 本人の権限で読むため、相談員は担当案件のみ、運営管理者は全案件が返る（RLS）
// - 緊急フラグのある案件を最上位に固定し、以降は最終更新が古い（待たせている）順
// - メッセージ本文は含めない（本文は案件詳細でのみ返す）
// - 参照の事実を監査ログに記録してから返す
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const query = getQuery(event);
  const includeClosed = query.status === "all";

  const db = await userDb(event);
  let request = db
    .from("cases")
    .select("case_id, status, urgent_flag, opened_at, last_activity_at, rally_used, client_id, counselor_id, counselor:counselors(name)")
    .order("urgent_flag", { ascending: false })
    .order("last_activity_at", { ascending: true })
    .limit(200);
  if (!includeClosed) request = request.eq("status", "open");

  const { data, error } = await request;
  if (error) {
    console.error("[cases.list] query failed", error.code);
    throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }

  await writeAudit(event, staff, { action: "case.list", targetType: "cases" });

  return (data ?? []).map((row: any) => ({
    caseId: row.case_id as string,
    status: row.status as "open" | "closed",
    urgent: row.urgent_flag as boolean,
    openedAt: row.opened_at as string,
    lastActivityAt: row.last_activity_at as string,
    rallyUsed: row.rally_used as number,
    kind: row.client_id ? "corp" : "personal",
    assigneeName: (row.counselor?.name as string | undefined) ?? null,
    mine: row.counselor_id === staff.userId,
  }));
});
