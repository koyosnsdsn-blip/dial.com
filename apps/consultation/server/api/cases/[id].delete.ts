// 相談内容の削除（要件 9.3）。利用者本人が、終了した相談を削除する。
// - 削除操作の時点でやり取りを非表示にし、猶予期間の経過後に物理削除する（DB関数 user_delete_case）
// - 以後、本人の相談履歴には表示されない
// - 記録→削除の順（監査ログに記録できなければ削除しない）
// 【仮】猶予期間は30日（未決事項 No.9）。物理削除の自動実行は未実装
// 自治体委託型：委託元へ報告済みの記録は、この操作では消えない（3.12.5）。画面側で明示する
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const c = await requireOwnCase(event, account, caseId);
  if (c.status !== "closed") throw createError({ statusCode: 409, statusMessage: "case_open" });

  await writeAudit(event, account, { action: "case.delete", targetType: "cases", targetId: caseId });

  const { error } = await serviceDb(event).rpc("user_delete_case", { p_account_id: account.userId, p_case_id: caseId });
  if (error) rpcError(error);
  return { deleted: true };
});
