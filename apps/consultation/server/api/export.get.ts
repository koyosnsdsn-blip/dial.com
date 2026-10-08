import { isNicknameEmail } from "../../utils/nickname";
// 自身のデータの出力（要件 10.3.4）。利用者本人が、自分に関するデータをまとめて受け取る。
// - 対象：登録情報、属性の回答、相談の一覧・やり取りの全文・アンケートの回答
// - 相談員の氏名・識別子は含めない（3.6.1）。往復の回数・案件の通番も含めない
// - 出力の操作を監査ログに記録する（7.16）
// - 短時間の反復出力は不正なアクセスの兆候になり得るため、回数に上限を設ける
// 【仮】上限は24時間に3回（JSON・CSV 合わせて）。形式は、表計算ソフトで開ける CSV（?format=csv。やり取り・アンケート・Q&Aを1つの表にまとめる）と、全項目の JSON。形式・提供方法は実装フェーズで定める、とされている
// 未対応：相談サマリ（未実装）
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

  // Q&A の投稿と回答、処理の結果（questions はブラウザに権限を与えていないため service role で、本人の行だけを読む）
  const { data: posts, error: postError } = await sdb
    .from("questions")
    .select("display_id, body, status, posted_at, published_at, answers(body)")
    .eq("account_id", account.userId)
    .is("hidden_at", null)
    .order("posted_at", { ascending: true });
  if (postError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const postStatus: Record<string, string> = { pending: "確認中", published: "公開", rejected: "公開されませんでした", discarded: "公開されませんでした", merged: "すでにある Q&A をご案内" };

  await writeAudit(event, account, { action: "data.export", targetType: "accounts", targetId: account.userId });

  const closeReason: Record<string, string> = {
    rally: "やり取りの区切り",
    manual: "相談員による対応完了",
    idle: "一定期間やり取りがなかったため",
    expiry: "有効期間の満了",
    user: "ご自身で終了しました",
  };
  setHeader(event, "Cache-Control", "no-store");
  const data = {
    出力日時: new Date().toISOString(),
    登録情報: isNicknameEmail(own?.email ?? account.email, useRuntimeConfig(event).public.nicknameDomain as string)
      ? { ニックネーム: account.nickname, 登録日時: own?.created_at ?? null }
      : { メールアドレス: own?.email ?? account.email, 登録日時: own?.created_at ?? null },
    属性の回答: (attrRows ?? []).map((a: any) => ({
      設問: a.question_text_snapshot,
      回答: a.option_label_snapshot,
      回答日時: a.answered_at,
      最終変更日時: a.updated_at,
    })),
    "Q&Aの投稿": ((posts ?? []) as any[]).map((p) => ({
      表示ID: p.display_id,
      投稿日時: p.posted_at,
      状態: postStatus[p.status] ?? p.status,
      質問: p.body,
      回答: p.status === "published" ? (p.answers?.[0]?.body ?? null) : null,
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

  if (getQuery(event).format !== "csv") return data;

  // CSV：1行1件の時系列の表。Excel で文字化けしないよう、UTF-8（BOM付き）で返す
  // 表計算ソフトが式として実行しないよう、= + - @ で始まる値の先頭に ' を付ける
  const cell = (v: unknown) => {
    let t = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const rows: unknown[][] = [["種類", "相談の開始日時", "日時", "項目", "内容"]];
  for (const c of data.相談) {
    for (const a of c.アンケートの回答) rows.push(["アンケート", c.開始日時, "", `${a.区分}：${a.設問}`, a.回答]);
    for (const m of c.やり取り) rows.push(["やり取り", c.開始日時, m.送信日時, m.送信者, m.本文]);
    rows.push(["相談の状態", c.開始日時, c.終了日時 ?? "", c.状態, c.終了の理由 ?? ""]);
  }
  for (const p of data["Q&Aの投稿"]) {
    rows.push(["Q&A", "", p.投稿日時, `質問（${p.状態}）`, p.質問]);
    if (p.回答) rows.push(["Q&A", "", p.投稿日時, "回答", p.回答]);
  }
  for (const a of data.属性の回答) rows.push(["属性の回答", "", a.回答日時, a.設問, a.回答]);
  setHeader(event, "Content-Type", "text/csv; charset=utf-8");
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
});
