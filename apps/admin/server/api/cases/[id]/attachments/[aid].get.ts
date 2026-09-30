// 添付画像の取得（要件 3.8）。見えている案件（担当の案件。運営管理者は全件）の画像だけを返す。
// 相談内容にあたるため、返す前に監査ログを記録する
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const attachmentId = requireUuid(getRouterParam(event, "aid"), "attachment_id");
  await requireVisibleCase(event, caseId);
  await writeAudit(event, staff, { action: "attachment.view", targetType: "cases", targetId: caseId });
  return await sendAttachment(event, caseId, attachmentId);
});
