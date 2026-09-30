// 通報キュー（要件 7.11.3）。未対応の通報を、記事ごとにまとめて返す。自動で一時非公開になった記事を上に出す。
// 通報者は返さない（誰が通報したかを相談員に見せる必要がないため）。同じ利用者による通報の多さは、件数だけを返す
export default defineEventHandler(async (event) => {
  await requireStaff(event);
  const db = serviceDb(event);
  const { data, error } = await db
    .from("reports")
    .select("question_id, reporter_account_id, reason_code, reported_at, question:questions(body, unpublished_at, unpublish_reason, status, hidden_at)")
    .is("resolution", null)
    .order("reported_at", { ascending: true })
    .limit(1000);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  // 通報の濫用の検知：直近30日に10件以上通報している利用者による通報かどうか（件数の目安だけ）
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const reporters = [...new Set((data ?? []).map((r: any) => r.reporter_account_id).filter(Boolean))];
  const heavy = new Set<string>();
  const perReporter = new Map<string, number>();
  for (const part of chunks(reporters)) {
    const { data: all } = await db.from("reports").select("reporter_account_id").in("reporter_account_id", part).gte("reported_at", since).limit(5000);
    for (const r of all ?? []) perReporter.set(r.reporter_account_id, (perReporter.get(r.reporter_account_id) ?? 0) + 1);
  }
  for (const [k, v] of perReporter) if (v >= 10) heavy.add(k);

  const byQuestion = new Map<string, any>();
  for (const r of (data ?? []) as any[]) {
    if (!r.question || r.question.hidden_at) continue;
    const item = byQuestion.get(r.question_id) ?? {
      questionId: r.question_id as string,
      excerpt: Array.from(r.question.body as string).slice(0, 100).join(""),
      unpublished: Boolean(r.question.unpublished_at),
      autoHidden: r.question.unpublish_reason === "auto_report",
      count: 0,
      firstReportedAt: r.reported_at as string,
      reasons: {} as Record<string, number>,
      fromHeavyReporters: 0,
    };
    item.count++;
    const label = REPORT_REASONS[r.reason_code] ?? "その他";
    item.reasons[label] = (item.reasons[label] ?? 0) + 1;
    if (heavy.has(r.reporter_account_id)) item.fromHeavyReporters++;
    byQuestion.set(r.question_id, item);
  }
  return [...byQuestion.values()].sort((a, b) => Number(b.autoHidden) - Number(a.autoHidden) || b.count - a.count);
});
