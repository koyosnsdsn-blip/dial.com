// 自身のデータの出力（要件 10.3.4）。利用者本人が、自分に関するデータをまとめて受け取る。
// - 対象：登録情報、属性の回答、相談の一覧・やり取りの全文・アンケートの回答
// - 相談員の氏名・識別子は含めない（3.6.1）。往復の回数・案件の通番も含めない
// - 出力の操作を監査ログに記録する（7.16）
// - 短時間の反復出力は不正なアクセスの兆候になり得るため、回数に上限を設ける
// 【仮】上限は24時間に3回。形式は JSON（形式・提供方法は実装フェーズで定める、とされている）
// 未対応：Q&Aの投稿と回答（機能1が未実装）、相談サマリ（未実装）
const MAX_EXPORTS_PER_DAY = 3;

export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const sdb = serviceDb(event);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await sdb
    .from("audit_logs")
    .select("log_id", { count: "exact", head: true })
    .eq("actor_type", "account")
    .eq("actor_id", account.userId)
    .eq("action", "data.export")
    .gte("acted_at", since);
  if (countError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if ((count ?? 0) >= MAX_EXPORTS_PER_DAY) throw createError({ statusCode: 429, statusMessage: "export_limit" });

  // 本人の権限で読む（ビュー my_cases と RLS により、本人の案件・メッセージ・回答だけが返る）
  const db = await userDb(event);
  const [{ data: cases, error: caseError }, { data: own, error: ownError }] = await Promise.all([
    db.from("my_cases").select("case_id, status, close_reason, opened_at, closed_at").order("opened_at", { ascending: true }),
    db.from("accounts").select("email, created_at").eq("account_id", account.userId).maybeSingle(),
  ]);
  if (caseError || ownError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const ids = (cases ?? []).map((c: any) => c.case_id as string);
  let messages: any[] = [];
  let answers: any[] = [];
  if (ids.length > 0) {
    const [m, a] = await Promise.all([
      db.from("messages").select("case_id, sender, body, sent_at").in("case_id", ids).is("hidden_at", null).order("sent_at", { ascending: true }),
      db.from("case_survey_answers").select("case_id, kind, question_text_snapshot, option_label_snapshot").in("case_id", ids),
    ]);
    if (m.error || a.error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    messages = m.data ?? [];
    answers = a.data ?? [];
  }
  // 属性の現在の回答（account_attributes はブラウザに権限を与えていないため service role で、本人の行だけを読む）
  const { data: attrRows, error: attrError } = await sdb
    .from("account_attributes")
    .select("question_text_snapshot, option_label_snapshot, answered_at, updated_at")
    .eq("account_id", account.userId);
  if (attrError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  await writeAudit(event, account, { action: "data.export", targetType: "accounts", targetId: account.userId });

  const closeReason: Record<string, string> = {
    rally: "やり取りの区切り",
    manual: "相談員による対応完了",
    idle: "一定期間やり取りがなかったため",
    expiry: "有効期間の満了",
  };
  setHeader(event, "Cache-Control", "no-store");
  return {
    出力日時: new Date().toISOString(),
    登録情報: { メールアドレス: own?.email ?? account.email, 登録日時: own?.created_at ?? null },
    属性の回答: (attrRows ?? []).map((a: any) => ({
      設問: a.question_text_snapshot,
      回答: a.option_label_snapshot,
      回答日時: a.answered_at,
      最終変更日時: a.updated_at,
    })),
    相談: (cases ?? []).map((c: any) => ({
      開始日時: c.opened_at,
      状態: c.status === "open" ? "対応中" : "終了",
      終了日時: c.closed_at,
      終了の理由: c.close_reason ? closeReason[c.close_reason] ?? c.close_reason : null,
      アンケートの回答: answers
        .filter((a) => a.case_id === c.case_id)
        .map((a) => ({ 区分: a.kind === "attr" ? "属性" : "主訴", 設問: a.question_text_snapshot, 回答: a.option_label_snapshot })),
      やり取り: messages
        .filter((m) => m.case_id === c.case_id)
        .map((m) => ({ 送信者: m.sender === "user" ? "あなた" : "相談員", 送信日時: m.sent_at, 本文: m.body })),
    })),
  };
});
