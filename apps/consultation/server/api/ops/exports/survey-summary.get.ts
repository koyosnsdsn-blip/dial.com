// 社内業務用：アンケート集計の CSV（要件 7.9.5）。設問・選択肢ごとの件数と構成比、「答えない」の選択率。
// - 個人を識別する情報は含めない。範囲は本人の権限（RLS）に従う
// - この出力はクライアントへ提出しない（最小集計単位の制限を掛けていない。クライアント向けは 7.9.6）
// 絞り込み：期間（必須）、契約クライアント（client）、付与元（kind = corp / personal）
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { EXPORT_MAX_ROWS, exportRange, sendCsv, toCsv } from "../../../ops/csv";
import { userDb } from "../../../ops/db";
import { DECLINE_LABEL } from "../../../ops/survey";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const range = exportRange(event);
  const q = getQuery(event);
  const clientId = typeof q.client === "string" && q.client ? requireUuid(q.client, "client") : null;
  const db = await userDb(event);

  let request = db.from("cases").select("case_id, client_id").gte("opened_at", range.fromTs).lte("opened_at", range.toTs).limit(EXPORT_MAX_ROWS + 1);
  if (clientId) request = request.eq("client_id", clientId);
  if (q.kind === "corp") request = request.not("client_id", "is", null);
  if (q.kind === "personal") request = request.is("client_id", null);
  const { data, error } = await request;
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const ids = (data ?? []).map((r: any) => r.case_id as string);
  if (ids.length > EXPORT_MAX_ROWS) throw createError({ statusCode: 400, statusMessage: "too_many_rows" });

  const tally = new Map<string, { kind: string; question: string; options: Map<string, number>; total: number }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: a, error: aError } = await db.from("case_survey_answers").select("kind, question_text_snapshot, option_label_snapshot").in("case_id", ids.slice(i, i + 200));
    if (aError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const x of a ?? []) {
      const key = `${x.kind}:${x.question_text_snapshot}`;
      const t = tally.get(key) ?? { kind: x.kind, question: x.question_text_snapshot, options: new Map<string, number>(), total: 0 };
      t.options.set(x.option_label_snapshot, (t.options.get(x.option_label_snapshot) ?? 0) + 1);
      t.total++;
      tally.set(key, t);
    }
  }

  await writeAudit(event, staff, { action: "export.survey_summary", targetType: "case_survey_answers", reason: `アンケート集計 ${range.from}〜${range.to}／${ids.length}件` });

  const header = ["対象期間", "分類", "設問", "選択肢", "件数", "構成比", "「答えない」の選択率"];
  const out: unknown[][] = [];
  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "");
  for (const t of [...tally.values()].sort((a, b) => (a.kind === b.kind ? a.question.localeCompare(b.question, "ja") : a.kind === "attr" ? -1 : 1))) {
    const decline = pct(t.options.get(DECLINE_LABEL) ?? 0, t.total);
    for (const [label, n] of [...t.options.entries()].sort((a, b) => b[1] - a[1])) {
      out.push([`${range.from}〜${range.to}`, t.kind === "attr" ? "属性" : "主訴", t.question, label, n, pct(n, t.total), decline]);
    }
  }
  return sendCsv(event, `survey_summary_${range.from}_${range.to}.csv`, toCsv(header, out));
});
