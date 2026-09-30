// 相談者のメッセージ送信（要件 3.2.1・3.3）
// - 本人の対応中の案件にだけ送信できる
// - 記録→送信の順（監査ログに記録できなければ送信しない）。本文は監査ログに残さない
// - 相談員へのメール通知は未実装（メール配信サービスが未決：未決事項 No.59）。管理画面には Realtime で届く
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const body = await readBody<{ body?: unknown }>(event);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (text.length === 0) throw createError({ statusCode: 400, statusMessage: "empty_body" });
  if (text.length > 5000) throw createError({ statusCode: 400, statusMessage: "body_too_long" });

  const c = await requireOwnCase(event, account, caseId);
  if (c.status !== "open") throw createError({ statusCode: 409, statusMessage: "case_closed" });

  await writeAudit(event, account, { action: "message.send", targetType: "cases", targetId: caseId });

  const { data, error } = await serviceDb(event).rpc("user_send_message", {
    p_account_id: account.userId,
    p_case_id: caseId,
    p_body: text,
  });
  if (error) rpcError(error);
  return { messageId: (data as any).message_id as string, first: (data as any).first as boolean };
});
