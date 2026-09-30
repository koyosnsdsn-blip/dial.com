// ログイン中の利用者の状態。画面の出し分けに使う。
// 所属クライアントの名称は返さない（ログイン後の画面にクライアントを表示しない：要件 8.6.2）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const m = await membership(event, account);

  // 対応中の案件の有無（案件IDのみ。内容は返さないため監査ログの対象外）
  const { data: open, error } = await (await userDb(event))
    .from("cases")
    .select("case_id")
    .eq("account_id", account.userId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  return {
    email: account.email,
    linked: Boolean(account.clientId),
    canConsult: m.canConsult,
    contractType: m.contractType,
    openCaseId: (open?.case_id as string | undefined) ?? null,
  };
});
