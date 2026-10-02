// 添付ファイルの消去を、いま実行する（要件 7.13.1）。運営管理者のみ。通常は1日1回、自動で実行される
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { purgeQueuedFiles } from "../../../ops/purge";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  await writeAudit(event, staff, { action: "attachment.purge.run", targetType: "storage_purge_queue" });
  return await purgeQueuedFiles(event);
});
