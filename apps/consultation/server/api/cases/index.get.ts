// 相談履歴（要件 3.4.1）。開始日・状態・終了日と理由・主訴を返す。
// - 本人の権限（RLS）で読み、さらに account_id を明示して絞る
// - 担当者に関する情報（氏名・識別子）と、案件の通番・往復回数は返さない（要件 3.6.1・3.4.2・3.3.1）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const db = await userDb(event);

  const { data: rows, error } = await db
    .from("cases")
    .select("case_id, status, close_reason, opened_at, closed_at")
    .eq("account_id", account.userId)
    .order("opened_at", { ascending: false });
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const ids = (rows ?? []).map((r: any) => r.case_id as string);
  let answers: any[] = [];
  if (ids.length > 0) {
    const { data, error: ansError } = await db
      .from("case_survey_answers")
      .select("case_id, question_text_snapshot, option_label_snapshot")
      .in("case_id", ids)
      .eq("kind", "chief");
    if (ansError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    answers = data ?? [];
  }

  await writeAudit(event, account, { action: "case.list", targetType: "cases" });

  const chiefByCase = new Map<string, { question: string; answer: string }[]>();
  for (const a of answers) {
    const list = chiefByCase.get(a.case_id) ?? [];
    list.push({ question: a.question_text_snapshot, answer: a.option_label_snapshot });
    chiefByCase.set(a.case_id, list);
  }
  // 対応中の案件を最上部に置く
  const items = (rows ?? []).map((r: any) => ({
    caseId: r.case_id as string,
    status: r.status as "open" | "closed",
    closeReason: r.close_reason as string | null,
    openedAt: r.opened_at as string,
    closedAt: r.closed_at as string | null,
    chief: chiefByCase.get(r.case_id) ?? [],
  }));
  items.sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1));
  return { items };
});
