// 属性の修正（要件 3.11.9）
// - 選択肢の変更、および「答えない」への変更ができる
// - 反映は次回の相談から。過去の案件に複写された回答（case_survey_answers）は変更しない
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const body = await readBody<{ questionId?: unknown; optionId?: unknown }>(event);
  const questionId = requireUuid(body?.questionId, "question_id");
  const optionId = requireUuid(body?.optionId, "option_id");

  const questions = await activeQuestions(event, account);
  const q = questions.find((x) => x.questionId === questionId && x.kind === "attr");
  const option = q?.options.find((o) => o.optionId === optionId);
  if (!q || !option) throw createError({ statusCode: 400, statusMessage: "invalid_answer" });

  await writeAudit(event, account, { action: "attribute.update", targetType: "account_attributes", targetId: account.userId });

  // 既に回答がある設問だけを更新する（未回答の属性は、次の相談開始時に聴取する）
  const { data, error } = await serviceDb(event)
    .from("account_attributes")
    .update({ question_text_snapshot: q.text, option_label_snapshot: option.label, updated_at: new Date().toISOString() })
    .eq("account_id", account.userId)
    .eq("survey_question_id", questionId)
    .select("survey_question_id");
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  if (!data || data.length === 0) throw createError({ statusCode: 404, statusMessage: "not_found" });
  return { updated: true, label: option.label };
});
