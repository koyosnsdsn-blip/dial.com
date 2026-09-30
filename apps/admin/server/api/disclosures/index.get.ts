// 開示請求の一覧（要件 7.13.2）。運営管理者のみ。回答期限までの残りを画面で表示する
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const { data, error } = await serviceDb(event)
    .from("disclosure_requests")
    .select("request_id, account_id, requested_at, verified_at, due_at, completed_at, note")
    .order("requested_at", { ascending: false })
    .limit(300);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  await writeAudit(event, staff, { action: "disclosure.list", targetType: "disclosure_requests" });
  return (data ?? []).map((r: any) => ({
    requestId: r.request_id as string,
    accountId: r.account_id as string,
    requestedAt: r.requested_at as string,
    verifiedAt: r.verified_at as string | null,
    dueAt: r.due_at as string | null,
    completedAt: r.completed_at as string | null,
    note: r.note as string | null,
  }));
});
