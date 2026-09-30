import { isNicknameEmail } from "../../utils/nickname";
// ログイン中の利用者の状態。画面の出し分けに使う。
// 所属クライアントの名称は返さない（ログイン後の画面にクライアントを表示しない：要件 8.6.2）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const m = await membership(event, account);

  // 対応中の案件の有無（案件IDのみ。内容は返さないため監査ログの対象外）
  // my_cases は本人の行だけを返すビュー（見せてよい列のみ）
  const { data: open, error } = await (await userDb(event))
    .from("my_cases")
    .select("case_id")
    .eq("status", "open")
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  return {
    // ニックネームで登録した利用者には、内部用の識別子（メールアドレスの形）を見せない
    email: isNicknameEmail(account.email, useRuntimeConfig(event).public.nicknameDomain as string) ? null : account.email,
    nickname: account.nickname,
    linked: Boolean(account.clientId),
    canConsult: m.canConsult,
    contractType: m.contractType,
    openCaseId: (open?.case_id as string | undefined) ?? null,
  };
});
