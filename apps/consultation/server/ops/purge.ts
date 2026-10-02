// 物理削除された相談の添付ファイルを、保管先から消す（要件 9.3）。
// DB の定期処理（system_purge_deleted）は保管先のファイルを消せないため、消すべきファイルを storage_purge_queue に積む。
// ここでは、その待ち行列を処理する
import type { H3Event } from "h3";
import { serviceDb } from "./db";

export async function purgeQueuedFiles(event: H3Event): Promise<{ done: number; failed: number; remaining: number }> {
  const db = serviceDb(event);
  const { data, error } = await db.from("storage_purge_queue").select("queue_id, bucket, file_ref").is("done_at", null).order("queue_id").limit(200);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  let done = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const { error: removeError } = await db.storage.from(row.bucket).remove([row.file_ref]);
    if (removeError) {
      failed++;
      await db.from("storage_purge_queue").update({ last_error: removeError.message.slice(0, 300) }).eq("queue_id", row.queue_id);
    } else {
      done++;
      await db.from("storage_purge_queue").update({ done_at: new Date().toISOString(), last_error: null }).eq("queue_id", row.queue_id);
    }
  }
  const { count } = await db.from("storage_purge_queue").select("queue_id", { count: "exact", head: true }).is("done_at", null);
  if (done || failed) {
    await db.from("audit_logs").insert({ actor_type: "system", action: "attachment.purge", target_type: "storage_purge_queue", reason: `消去 ${done} 件／失敗 ${failed} 件` });
  }
  return { done, failed, remaining: count ?? 0 };
}
