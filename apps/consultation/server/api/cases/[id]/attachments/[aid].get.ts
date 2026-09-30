// 添付画像の取得（要件 3.8）。本人の案件の、表示中のメッセージに付いた画像だけを返す。
// 相談内容にあたるため、返す前に監査ログを記録する
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const attachmentId = requireUuid(getRouterParam(event, "aid"), "attachment_id");
  await requireOwnCase(event, account, caseId);
  await writeAudit(event, account, { action: "attachment.view", targetType: "cases", targetId: caseId });
  return await sendAttachment(event, caseId, attachmentId);
});
