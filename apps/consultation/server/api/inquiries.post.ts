// 運営への問い合わせ（要件 10.5）。操作の質問、削除・開示の申し出など。相談（機能2）とは別で、相談員は対応しない。
// - 相談の内容は書かないよう、画面で案内する
// - 1日に送れる件数を制限する
// 【仮】上限は24時間に5件。返信の手段（メール）がないため、対応の結果は利用者に届かない（未決事項 No.59・2.12）
const MAX_PER_DAY = 5;
const CATEGORIES = ["usage", "account", "deletion", "disclosure", "other"];

export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const body = await readBody<{ category?: unknown; body?: unknown }>(event);
  const category = typeof body?.category === "string" && CATEGORIES.includes(body.category) ? body.category : null;
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!category) throw createError({ statusCode: 400, statusMessage: "invalid_category" });
  if (text.length === 0 || text.length > 2000) throw createError({ statusCode: 400, statusMessage: "inquiry_body" });

  const db = serviceDb(event);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("inquiries")
    .select("inquiry_id", { count: "exact", head: true })
    .eq("account_id", account.userId)
    .gte("created_at", since);
  if (countError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if ((count ?? 0) >= MAX_PER_DAY) throw createError({ statusCode: 429, statusMessage: "inquiry_limit" });

  await writeAudit(event, account, { action: "inquiry.create", targetType: "inquiries" });
  const { error } = await db.from("inquiries").insert({ account_id: account.userId, category, body: text });
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
