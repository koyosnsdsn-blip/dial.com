// 失敗した削除の再実行（要件 7.13.1）。運営管理者のみ。
// 状態を「実行待ち」に戻し、その場で削除処理を実行する（猶予期間を過ぎているものだけが消える）
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { serviceDb } from "../../../../ops/db";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "request_id");
  const db = serviceDb(event);
  const { data: d, error } = await db.from("deletion_requests").select("execution_status, target_id").eq("request_id", id).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!d) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (d.execution_status !== "failed") throw createError({ statusCode: 409, statusMessage: "invalid_status" });
  await writeAudit(event, staff, { action: "deletion.retry", targetType: "deletion_requests", targetId: d.target_id });
  const { error: updateError } = await db.from("deletion_requests").update({ execution_status: "pending", executed_at: null }).eq("request_id", id);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  const { data: result, error: rpcErr } = await db.rpc("system_purge_deleted");
  if (rpcErr) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return result as { done: number; failed: number };
});
