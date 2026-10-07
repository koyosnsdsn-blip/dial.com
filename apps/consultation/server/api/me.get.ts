import { isNicknameEmail } from "../../utils/nickname";
// ログイン中の利用者の状態。画面の出し分けに使う。
// 所属クライアントの名称は返さない（ログイン後の画面にクライアントを表示しない：要件 8.6.2）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const [m, f] = await Promise.all([membership(event, account), featuresOf(event, account)]);

  // 対応中の案件の有無（案件IDのみ。内容は返さないため監査ログの対象外）
  // my_cases は本人の行だけを返すビュー（見せてよい列のみ）
  const db = await userDb(event);
  const [open, { data: unread, error: unreadError }] = await Promise.all([
    openCasesOf(event),
    // 相談員からの返信で、まだ開いていないものがある案件（終了した案件も含む。返信と同時に終了する場合があるため）
    db.from("my_cases").select("case_id").eq("has_unread", true).order("opened_at", { ascending: false }).limit(1),
  ]);
  if (unreadError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  return {
    // ニックネームで登録した利用者には、内部用の識別子（メールアドレスの形）を見せない
    email: isNicknameEmail(account.email, useRuntimeConfig(event).public.nicknameDomain as string) ? null : account.email,
    nickname: account.nickname,
    linked: Boolean(account.clientId),
    canConsult: m.canConsult,
    // 利用できる機能（無効な機能は、画面と導線を出さない：要件 3.10.7）
    features: f,
    // 企業会員向けの画面では、会員区分・決済に関する表示をしない（8.6.1.1）。個人利用者かどうかだけを返す
    personal: account.tier !== "member",
    contractType: m.contractType,
    // 対応中の相談（枠ごとに1件まで。最大2件）。企業会員向けの画面では「無償」などの区分を表示しないため、枠の区別は free かどうかだけ返す
    openCases: open,
    // 画面の遷移先の既定：企業枠・有料の相談を優先する
    openCaseId: (open.find((c) => !c.free) ?? open[0])?.caseId ?? null,
    // 新しい相談を始められるか
    canStart: canStartNew(m, open),
    // メールでの通知をしないため、ログイン後の画面で「お返事が届いています」と知らせる（未決事項一覧 2.12）
    unreadCaseId: (unread?.[0]?.case_id as string | undefined) ?? null,
  };
});
