// 相談の開始（企業枠。要件 3.2.3・3.7・3.11）
// - 契約ステータスと、有効な案件がないことの判定・利用権の付与・担当の割当は、DB関数 user_start_case が
//   1トランザクションで行う（同時アクセスで2件開かないよう排他制御する：要件 8.3）
// - 【仮】個人の都度課金による開始は未実装（決済代行が未決：未決事項 No.6）
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

  await writeAudit(event, account, { action: "case.start", targetType: "cases" });

  const { data, error } = await serviceDb(event).rpc("user_start_case", {
    p_account_id: account.userId,
    p_answers: clean,
    p_muni_consent: body?.muniConsent === true,
  });
  if (error) rpcError(error);
  return { caseId: (data as any).case_id as string };
});
