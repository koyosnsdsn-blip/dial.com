// 退会（要件 10.3.3・9.3）。利用者本人が、ログインした状態で行う。
// - 対応中の相談は終了し、すべての相談を削除の扱いにする（即時に非表示、猶予期間の経過後に完全に消去）
// - ニックネーム・メールアドレス・パスワードなど、本人を識別する情報を消し、以後ログインできなくする
// - 監査ログは残す（誰のものかを示すのは内部のIDのみ）
// 取り消せない操作のため、確認の文言（「退会する」）の入力を必須とする。記録→実行の順
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const body = await readBody<{ confirm?: unknown }>(event);
  if (body?.confirm !== "退会する") throw createError({ statusCode: 400, statusMessage: "confirm_mismatch" });

  await writeAudit(event, account, { action: "account.withdraw", targetType: "accounts", targetId: account.userId });

  const { error } = await serviceDb(event).rpc("user_withdraw", { p_account_id: account.userId });
  if (error) {
    if ((error.message ?? "").includes("staff_account")) throw createError({ statusCode: 403, statusMessage: "staff_account" });
    rpcError(error);
  }
  return { withdrawn: true };
});
