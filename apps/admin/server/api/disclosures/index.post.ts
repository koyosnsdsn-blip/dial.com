// 開示請求の受付（要件 7.13.2）。運営管理者のみ。利用者アカウントの照会の結果から登録する。
// 【仮】回答期限は受付から14日（サービス全体設定 disclosure_due_days。未決事項 No.51）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<{ accountId?: unknown; note?: unknown }>(event);
  const accountId = requireUuid(body?.accountId, "account_id");
  const note = requireText(body?.note, "note", 1000);
  const db = serviceDb(event);
  const { data: acc } = await db.from("accounts").select("account_id").eq("account_id", accountId).maybeSingle();
  if (!acc) throw createError({ statusCode: 404, statusMessage: "not_found" });
  const days = (await getSettings(event)).disclosure_due_days!;

  await writeAudit(event, staff, { action: "disclosure.create", targetType: "accounts", targetId: accountId });
  const { data, error } = await db
    .from("disclosure_requests")
    .insert({ account_id: accountId, due_at: new Date(Date.now() + days * 86400000).toISOString(), note, created_by: staff.userId })
    .select("request_id")
    .single();
  if (error || !data) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { requestId: data.request_id as string };
});
