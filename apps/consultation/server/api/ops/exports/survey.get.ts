// 社内業務用：アンケート回答明細の CSV（要件 7.9.4）。案件ごとに1行。
// - 利用者の氏名・会員ID・メールアドレスは含めない
// - 「答えない」も値として出力する（未回答と回答拒否を区別するため）
// - 列見出しは、回答時点の設問文（複写）を使う。設問が編集・削除されても、過去の回答の意味が失われない
// - 属性は、利用権付与時点に案件へ複写された値
// - 出力できる範囲は本人の権限（RLS）に従う。出力の操作を監査ログに記録する
// この出力はクライアントへ提出しない（クライアント向けは四半期レポートの集計値に限る：7.9.6）
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { caseLimits, clientNames } from "../../../ops/cases";
import { EXPORT_MAX_ROWS, exportRange, jstDateTime, sendCsv, toCsv } from "../../../ops/csv";
import { userDb } from "../../../ops/db";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const range = exportRange(event);
  const db = await userDb(event);

  const { data, error } = await db
    .from("cases")
    .select("case_id, client_id, opened_at")
    .gte("opened_at", range.fromTs)
    .lte("opened_at", range.toTs)
    .order("opened_at", { ascending: true })
    .limit(EXPORT_MAX_ROWS + 1);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const rows = (data ?? []) as any[];
  if (rows.length > EXPORT_MAX_ROWS) throw createError({ statusCode: 400, statusMessage: "too_many_rows" });
  const ids = rows.map((r) => r.case_id as string);

  // 列：属性 → 主訴 の順に、設問文ごとに1列（出現順）
  const columns: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  const answers = new Map<string, Map<string, string>>();
  const collected: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: a, error: aError } = await db
      .from("case_survey_answers")
      .select("case_id, kind, question_text_snapshot, option_label_snapshot")
      .in("case_id", ids.slice(i, i + 200));
    if (aError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    collected.push(...(a ?? []));
  }
  for (const kind of ["attr", "chief"]) {
    for (const x of collected) {
      if (x.kind !== kind) continue;
      const key = `${kind}:${x.question_text_snapshot}`;
      if (!seen.has(key)) {
        seen.add(key);
        columns.push({ key, label: `${kind === "attr" ? "属性" : "主訴"}：${x.question_text_snapshot}` });
      }
      const byCase = answers.get(x.case_id) ?? new Map<string, string>();
      byCase.set(key, x.option_label_snapshot);
      answers.set(x.case_id, byCase);
    }
  }
  const [limits, names] = await Promise.all([caseLimits(event, ids), clientNames(event, rows.map((r) => r.client_id))]);

  await writeAudit(event, staff, {
    action: "export.survey",
    targetType: "case_survey_answers",
    reason: `アンケート回答明細 ${range.from}〜${range.to}／${rows.length}件`,
  });

  const header = ["案件ID", "利用権の付与日", "付与元", "契約クライアント名", ...columns.map((c) => c.label)];
  const out = rows.map((r) => [
    r.case_id,
    jstDateTime(r.opened_at).slice(0, 10),
    limits.get(r.case_id)?.source === "client" ? "企業枠" : "個人課金",
    r.client_id ? names.get(r.client_id) ?? "" : "",
    ...columns.map((c) => answers.get(r.case_id)?.get(c.key) ?? ""),
  ]);
  return sendCsv(event, `survey_${range.from}_${range.to}.csv`, toCsv(header, out));
});
