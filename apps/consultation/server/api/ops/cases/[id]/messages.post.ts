// 相談員の返信（要件 7.3・3.3）。画像を添付できる（3.8）
// - 担当相談員または運営管理者のみ
// - 1往復＝相談員の返信1回。上限に達した返信で案件は自動的にクローズする（要件 3.2.5）
// - 記録→送信の順（監査ログに記録できなければ送信しない）
// - 相談者へのメール通知は未実装（メール配信サービスの選定が未決：未決事項 No.59）
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireCaseOperator, requireText, requireVisibleCase, rpcError } from "../../../../ops/cases";
import { serviceDb } from "../../../../ops/db";
import { readMessageInput, storeImages } from "../../../../utils/attachments";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const input = await readMessageInput(event);
  const text = requireText(input.text, "body", 5000);

  const c = await requireVisibleCase(event, caseId);
  requireCaseOperator(staff, c);
  if (c.status !== "open") throw createError({ statusCode: 409, statusMessage: "case_closed" });

  await writeAudit(event, staff, { action: "message.send", targetType: "cases", targetId: caseId, reason: input.images.length ? `画像 ${input.images.length} 枚` : null });

  const { data, error } = await serviceDb(event).rpc("staff_send_reply", { p_case_id: caseId, p_body: text });
  if (error) rpcError(error);
  const result = data as { message_id: string; rally_used: number; rally_max: number; closed: boolean };
  const failedImages = input.images.length ? await storeImages(event, caseId, result.message_id, input.images) : 0;
  // 送信できたら、下書きを消す（失敗しても送信は完了しているので続行する）
  await serviceDb(event).from("reply_drafts").delete().eq("case_id", caseId).eq("counselor_id", staff.userId);
  return { ...result, failedImages };
});
