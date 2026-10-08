// 通知用のメールアドレス（未決事項一覧 2.17）。ニックネームで登録した方だけが対象。
// メールアドレスで登録した方は、ログインに使うアドレスが通知の届け先なので、ここは使わない。
// いまは保存と表示だけ。確認メール・通知の送信は、メール配信の仕組み（No.59）ができてから接続する。
import { isNicknameEmail } from "../../../utils/nickname";

export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const applicable = isNicknameEmail(account.email, useRuntimeConfig(event).public.nicknameDomain as string);
  if (!applicable) return { applicable: false, email: null, verified: false };
  const { data, error } = await serviceDb(event).from("account_notify_emails").select("email, verified_at").eq("account_id", account.userId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  setHeader(event, "Cache-Control", "no-store");
  return { applicable: true, email: data?.email ?? null, verified: Boolean(data?.verified_at) };
});
