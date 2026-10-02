// 既存のQ&Aへマージ（要件 6.5・7.4）。統合先は公開中の記事。投稿枠は返す
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { serviceDb } from "../../../../ops/db";
import { qaRpcError } from "../../../../ops/qa";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const body = await readBody<{ into?: unknown }>(event);
  const into = requireUuid(body?.into, "merge_target");

  await writeAudit(event, staff, { action: "qa.merge", targetType: "questions", targetId: id, reason: `統合先 ${into}` });
  const { data, error } = await serviceDb(event).rpc("staff_merge_question", { p_question_id: id, p_counselor_id: staff.userId, p_into: into });
  if (error) qaRpcError(error);
  return data as { merged: boolean };
});
