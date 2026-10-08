// 通知用メールアドレスの削除
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  await writeAudit(event, account, { action: "account.notify_email.delete", targetType: "accounts", targetId: account.userId });
  const { error } = await serviceDb(event).from("account_notify_emails").delete().eq("account_id", account.userId);
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
