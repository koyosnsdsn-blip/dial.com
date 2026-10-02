// 問い合わせの一覧（要件 10.5）。運営管理者のみ。運営に対する問い合わせで、相談（機能2）とは別。
// 問い合わせた利用者は、ニックネームまたはメールアドレスを表示する（返信の手段がメールの場合に必要）
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const q = getQuery(event);
  const db = serviceDb(event);
  let request = db.from("inquiries").select("inquiry_id, account_id, category, body, status, created_at, handled_at, note, handler:counselors(name)").order("created_at", { ascending: false }).limit(200);
  if (q.status === "open" || q.status === "done") request = request.eq("status", q.status);
  const { data, error } = await request;
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  await writeAudit(event, staff, { action: "inquiry.list", targetType: "inquiries" });
  return (data ?? []).map((r: any) => ({
    inquiryId: r.inquiry_id as string,
    accountId: r.account_id as string | null,
    category: r.category as string,
    body: r.body as string,
    status: r.status as "open" | "done",
    createdAt: r.created_at as string,
    handledAt: r.handled_at as string | null,
    handledBy: (r.handler?.name as string | undefined) ?? null,
    note: r.note as string | null,
  }));
});
