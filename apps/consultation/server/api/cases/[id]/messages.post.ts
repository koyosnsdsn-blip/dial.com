// 相談者のメッセージ送信（要件 3.2.1・3.3）。画像を添付できる（3.8）
// - 本人の対応中の案件にだけ送信できる
// - 記録→送信の順（監査ログに記録できなければ送信しない）。本文は監査ログに残さない
// - 相談員へのメール通知は未実装（メール配信サービスが未決：未決事項 No.59）。管理画面には Realtime で届く
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const input = await readMessageInput(event);
  // 画像だけを送る場合は、本文の代わりに定型の一言を入れる
  const text = input.text.length === 0 && input.images.length > 0 ? "（画像を送りました）" : input.text;
  if (text.length === 0) throw createError({ statusCode: 400, statusMessage: "empty_body" });
  if (text.length > 5000) throw createError({ statusCode: 400, statusMessage: "body_too_long" });

  const c = await requireOwnCase(event, account, caseId);
  if (c.status !== "open") throw createError({ statusCode: 409, statusMessage: "case_closed" });

  await writeAudit(event, account, {
    action: "message.send",
    targetType: "cases",
    targetId: caseId,
    reason: input.images.length ? `画像 ${input.images.length} 枚` : null,
  });

  const { data, error } = await serviceDb(event).rpc("user_send_message", {
    p_account_id: account.userId,
    p_case_id: caseId,
    p_body: text,
  });
  if (error) rpcError(error);
  const messageId = (data as any).message_id as string;
  const failedImages = input.images.length ? await storeImages(event, caseId, messageId, input.images) : 0;
  return { messageId, first: (data as any).first as boolean, failedImages };
});
