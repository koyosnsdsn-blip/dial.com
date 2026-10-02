// 二次利用同意の状況（要件 7.13.3）。運営管理者のみ。同意済みの相談は、記事の直接作成の素材に選べる
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
import { chunks } from "../../../ops/qa";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const db = serviceDb(event);
  const { data, error } = await db.from("reuse_consents").select("case_id, status, requested_at, responded_at, expires_at").neq("status", "unrequested").order("requested_at", { ascending: false }).limit(300);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const ids = (data ?? []).map((r: any) => r.case_id as string);
  const used = new Set<string>();
  for (const part of chunks(ids)) {
    const { data: qs, error: qError } = await db.from("questions").select("source_case_id").in("source_case_id", part);
    if (qError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const q of qs ?? []) used.add(q.source_case_id);
  }
  await writeAudit(event, staff, { action: "reuse.list", targetType: "reuse_consents" });
  return (data ?? []).map((r: any) => ({
    caseId: r.case_id as string,
    // 期限を過ぎた依頼は、失効として扱う（1日1回の定期処理でも更新される）
    status: (r.status === "requested" && r.expires_at && new Date(r.expires_at).getTime() <= Date.now() ? "expired" : r.status) as string,
    requestedAt: r.requested_at as string | null,
    respondedAt: r.responded_at as string | null,
    expiresAt: r.expires_at as string | null,
    articleCreated: used.has(r.case_id),
  }));
});
