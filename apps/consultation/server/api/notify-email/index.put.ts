// 通知用メールアドレスの登録・変更。登録直後は「確認前」で、確認前のアドレスには何も送らない。
import { isNicknameEmail } from "../../../utils/nickname";

export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  if (!isNicknameEmail(account.email, useRuntimeConfig(event).public.nicknameDomain as string)) {
    throw createError({ statusCode: 409, statusMessage: "not_applicable" });
  }
  const body = await readBody<{ email?: unknown }>(event);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw createError({ statusCode: 400, statusMessage: "invalid_email" });
  // 内部用のドメイン（受信できない）は登録できない
  if (email.endsWith(`@${useRuntimeConfig(event).public.nicknameDomain as string}`)) throw createError({ statusCode: 400, statusMessage: "invalid_email" });

  // メールアドレスは監査ログに残さない
  await writeAudit(event, account, { action: "account.notify_email.set", targetType: "accounts", targetId: account.userId });
  const { error } = await serviceDb(event)
    .from("account_notify_emails")
    .upsert({ account_id: account.userId, email, verified_at: null, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { email, verified: false };
});
