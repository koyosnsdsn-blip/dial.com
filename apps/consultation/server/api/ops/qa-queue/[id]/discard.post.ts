// 破棄（要件 6.4.4・7.4）。区分 G1〜G4 と理由の記録が必須。投稿枠は返さない。
// 判定は、文章の質ではなく、相談する意図が認められるかどうかで行う
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireText } from "../../../../ops/cases";
import { serviceDb } from "../../../../ops/db";
import { DISCARD_CODES, qaRpcError } from "../../../../ops/qa";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const body = await readBody<{ code?: unknown; text?: unknown }>(event);
  if (typeof body?.code !== "string" || !(body.code in DISCARD_CODES)) throw createError({ statusCode: 400, statusMessage: "invalid_code" });
  const text = requireText(body?.text, "reason", 1000);

  await writeAudit(event, staff, { action: "qa.discard", targetType: "questions", targetId: id, reason: `${body.code}：${text}`.slice(0, 2000) });
  const { data, error } = await serviceDb(event).rpc("staff_discard_question", { p_question_id: id, p_counselor_id: staff.userId, p_code: body.code, p_text: text });
  if (error) qaRpcError(error);
  return data as { discarded: boolean; discard_count: number; suspended: boolean };
});
