// クライアント別の追加設問の一覧（要件 7.10.5）。運営管理者のみ。
// プレビュー用に共通設問も返す。設問ごとに、今の四半期に開始された相談での回答件数を返す（期中変更の警告用）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const client = await requireEditableClient(event, clientId);
  const db = serviceDb(event);

  const { data, error } = await db
    .from("survey_questions")
    .select("survey_question_id, client_id, kind, question_text, sort_order, aggregatable, active, created_at, options:survey_options(label, sort_order)")
    .or(`client_id.is.null,client_id.eq.${clientId}`)
    .order("sort_order");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  // 四半期の開始（日本時間。1・4・7・10月の1日）
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const quarterMonth = Math.floor(jst.getUTCMonth() / 3) * 3;
  const quarterStart = `${jst.getUTCFullYear()}-${String(quarterMonth + 1).padStart(2, "0")}-01T00:00:00+09:00`;
  const extraIds = (data ?? []).filter((q: any) => q.client_id).map((q: any) => q.survey_question_id as string);
  const answered = new Map<string, number>();
  if (extraIds.length > 0) {
    const { data: rows, error: ansError } = await db
      .from("case_survey_answers")
      .select("survey_question_id, cases!inner(opened_at)")
      .in("survey_question_id", extraIds)
      .gte("cases.opened_at", quarterStart);
    if (ansError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const r of rows ?? []) answered.set(r.survey_question_id, (answered.get(r.survey_question_id) ?? 0) + 1);
  }

  await writeAudit(event, staff, { action: "survey.view", targetType: "clients", targetId: clientId });

  const shape = (q: any) => ({
    questionId: q.survey_question_id as string,
    kind: q.kind as "attr" | "chief",
    text: q.question_text as string,
    aggregatable: q.aggregatable as boolean,
    active: q.active as boolean,
    createdAt: q.created_at as string,
    answeredThisQuarter: answered.get(q.survey_question_id) ?? 0,
    options: (q.options ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((o: any) => o.label as string),
  });
  const all = data ?? [];
  return {
    clientName: client.name,
    clientStatus: client.status,
    maxExtra: MAX_EXTRA_QUESTIONS,
    common: all.filter((q: any) => !q.client_id && q.active).map(shape),
    extra: all.filter((q: any) => q.client_id).map(shape),
  };
});
