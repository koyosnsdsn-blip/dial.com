// 追加設問の作成（要件 7.10.5）。運営管理者のみ。理由は必須。
// - 有効な追加設問は2問まで
// - 「答えない」の選択肢を自動で付ける
// - 禁止事項に当たらないことの確認（checklistConfirmed）が必須。確認者と日時は監査ログに残る
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const body = await readBody<Record<string, unknown>>(event);
  const reason = requireText(body?.reason, "reason", 500);
  const input = parseSurveyInput(body);

  const client = await requireEditableClient(event, clientId);
  if (client.status === "closed") throw createError({ statusCode: 409, statusMessage: "client_closed" });

  const { count } = await serviceDb(event)
    .from("survey_questions")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("active", true);
  if ((count ?? 0) >= MAX_EXTRA_QUESTIONS) throw createError({ statusCode: 409, statusMessage: "survey_limit" });

  await writeAudit(event, staff, {
    action: "survey.create",
    targetType: "clients",
    targetId: clientId,
    reason: `${reason}（設問：${input.text}／分類：${input.kind}／禁止事項の確認済み）`.slice(0, 2000),
  });

  const questionId = await insertQuestion(event, clientId, input, await nextSortOrder(event, clientId));
  return { questionId };
});
