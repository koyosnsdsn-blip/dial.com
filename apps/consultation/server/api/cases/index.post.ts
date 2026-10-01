// 相談の開始（要件 3.2.3・3.7・3.11）。企業枠と、【仮】ニックネームで登録した利用者の無償の相談
// - 契約ステータスと、有効な案件がないことの判定・利用権の付与・担当の割当は、DB関数 user_start_case が
//   1トランザクションで行う（同時アクセスで2件開かないよう排他制御する：要件 8.3）
// - 【仮】個人の都度課金による開始は未実装（決済代行が未決：未決事項 No.6）。
//   ニックネームで登録した、所属のない利用者は、招待コードなし・費用なしで開始できる（対象かどうかはここで判定して DB に渡す）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const body = await readBody<{ answers?: unknown; muniConsent?: unknown }>(event);
  const answers = body?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw createError({ statusCode: 400, statusMessage: "survey_incomplete" });
  }
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    clean[requireUuid(k, "question_id")] = requireUuid(v, "option_id");
  }

  const m = await membership(event, account);
  await writeAudit(event, account, { action: "case.start", targetType: "cases", reason: m.personalFree ? "招待コードなし（無償）" : null });

  const { data, error } = await serviceDb(event).rpc("user_start_case", {
    p_account_id: account.userId,
    p_answers: clean,
    p_muni_consent: body?.muniConsent === true,
    p_personal_free: m.personalFree,
  });
  if (error) rpcError(error);
  return { caseId: (data as any).case_id as string };
});
