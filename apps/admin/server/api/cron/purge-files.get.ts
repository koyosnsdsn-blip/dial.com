import { timingSafeEqual } from "node:crypto";
// 定期実行（Vercel Cron Jobs）：添付ファイルの消去。1日1回（vercel.json）。
// Vercel は、環境変数 CRON_SECRET が設定されていると、Authorization: Bearer <CRON_SECRET> を付けて呼び出す。
// CRON_SECRET が未設定のとき、または一致しないときは実行しない（外部から呼び出されても何も起きない）
export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (getHeader(event, "authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  if (secret.length < 16 || a.length !== b.length || !timingSafeEqual(a, b)) throw createError({ statusCode: 401, statusMessage: "unauthorized" });
  return await purgeQueuedFiles(event);
});
