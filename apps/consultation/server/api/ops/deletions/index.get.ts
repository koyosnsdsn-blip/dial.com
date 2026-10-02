// 削除依頼の状況（要件 7.13.1）。運営管理者のみ。
// 利用者の削除操作は相談者側で完結するが、猶予期間後の物理削除が実行されたか・失敗していないかを確認する
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const { data, error } = await serviceDb(event)
    .from("deletion_requests")
    .select("request_id, target_type, target_id, requested_at, purge_after, executed_at, execution_status")
    .order("requested_at", { ascending: false })
    .limit(300);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  await writeAudit(event, staff, { action: "deletion.list", targetType: "deletion_requests" });
  return (data ?? []).map((d: any) => ({
    requestId: d.request_id as string,
    targetType: d.target_type as string,
    targetId: d.target_id as string,
    requestedAt: d.requested_at as string,
    purgeAfter: d.purge_after as string | null,
    executedAt: d.executed_at as string | null,
    status: d.execution_status as "pending" | "done" | "failed",
  }));
});
