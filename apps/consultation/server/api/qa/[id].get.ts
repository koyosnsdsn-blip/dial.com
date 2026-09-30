// Q&A の詳細（要件 2.4）。質問は全文、回答は会員区分に応じて全文または冒頭30文字を返す。
//   未登録：冒頭30文字　無料会員：冒頭30文字（月3本まで全文を開ける）　月額会員・企業会員：全文
// 回答を切り詰めるのはサーバー側。読めない利用者のブラウザには、全文を一切送らない
export default defineEventHandler(async (event) => {
  const account = await optionalAccount(event);
  const f = await featuresOf(event, account);
  if (!f.qa) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const db = serviceDb(event);

  const { data, error } = await publicQuestions(db, "question_id, display_id, operator_created, genre_id, body, published_at, answers(body, updated_at, published_at)")
    .eq("question_id", id)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data) throw createError({ statusCode: 404, statusMessage: "qa_not_found" });
  const row = data as any;

  let full = f.qaFull;
  let remainingReads: number | null = null;
  let reported = false;
  let own = false;
  if (account) {
    const ym = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date());
    const [reads, rep, mine] = await Promise.all([
      f.qaFull ? Promise.resolve({ data: [] as any[], error: null }) : db.from("qa_full_reads").select("question_id, year_month").eq("account_id", account.userId),
      db.from("reports").select("report_id").eq("question_id", id).eq("reporter_account_id", account.userId).is("resolution", null).limit(1),
      db.from("questions").select("question_id").eq("question_id", id).eq("account_id", account.userId).limit(1),
    ]);
    if (reads.error || rep.error || mine.error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    reported = (rep.data ?? []).length > 0;
    own = (mine.data ?? []).length > 0;
    if (!f.qaFull) {
      const rows = (reads.data ?? []) as any[];
      if (rows.some((r) => r.question_id === id) || own) full = true;
      remainingReads = Math.max(0, 3 - rows.filter((r) => r.year_month === ym).length);
    }
  }

  // 閲覧数（失敗しても表示は続ける）
  const { error: viewError } = await db.rpc("qa_count_view", { p_question_id: id });
  if (viewError) console.error("[qa.view] failed to count", viewError.code);

  const { data: genre } = row.genre_id ? await db.from("genres").select("name").eq("genre_id", row.genre_id).maybeSingle() : { data: null };
  const answer = (row.answers?.[0]?.body as string | undefined) ?? "";
  return {
    questionId: row.question_id as string,
    displayId: (row.display_id as string | null) ?? null,
    operatorCreated: Boolean(row.operator_created),
    genre: (genre?.name as string | undefined) ?? null,
    question: row.body as string,
    publishedAt: row.published_at as string | null,
    answer: full ? answer : preview(answer, ANSWER_PREVIEW),
    answerMasked: !full && Array.from(answer).length > ANSWER_PREVIEW,
    answerUpdatedAt: (row.answers?.[0]?.updated_at as string | null) ?? null,
    signedIn: Boolean(account),
    remainingReads,
    reported,
    own,
    features: f,
  };
});
