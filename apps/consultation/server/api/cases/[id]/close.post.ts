// 利用者本人による相談の終了（2026-10-07 入江さんの指示）
// - 対応中の相談を、本人が自分で終了する。終了後も、やり取りは本人が引き続き閲覧できる（送信は不可）
// - 終了の理由は close_reason = 'user'。相談員の画面には「利用者本人による終了」と表示する
// - 終了すると、同じ枠で新しい相談を始められる（要件 3.4.2：打ち切りとして伝えず、再開の導線を示す）
// - 記録→終了の順（監査ログに記録できなければ終了しない）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const c = await requireOwnCase(event, account, caseId);
  if (c.status !== "open") throw createError({ statusCode: 409, statusMessage: "case_closed" });

  await writeAudit(event, account, { action: "case.close.user", targetType: "cases", targetId: caseId });

  const { error } = await serviceDb(event).rpc("user_close_case", { p_account_id: account.userId, p_case_id: caseId });
  if (error) rpcError(error);
  return { closed: true };
});
