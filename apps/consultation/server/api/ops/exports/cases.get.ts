// 社内業務用：案件明細の CSV（要件 7.9.2）。案件のメタデータのみを出力する。
// - 相談内容の本文・メッセージ・相談サマリは含めない（7.9.1）
// - 利用者の氏名・会員ID・メールアドレスは含めない。案件IDで管理画面から参照できる
// - 出力できる範囲は本人の権限（RLS）に従う：運営管理者は全案件、相談員は自分の担当案件のみ
// - 出力の操作を監査ログに記録する（実行者・日時・種別・対象範囲・件数）
// 【仮】SLAの遵守は暦時間で判定している（起算方式が未決：未決事項 No.47）。有効期間の残日数は、企業枠は無期限のため出力しない
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
    .select("case_id, account_id, client_id, status, close_reason, urgent_flag, rally_used, opened_at, last_activity_at, closed_at, awaiting_reply_since, counselor:counselors(name)")
    .gte("opened_at", range.fromTs)
    .lte("opened_at", range.toTs)
    .order("opened_at", { ascending: true })
    .limit(EXPORT_MAX_ROWS + 1);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const rows = (data ?? []) as any[];
  if (rows.length > EXPORT_MAX_ROWS) throw createError({ statusCode: 400, statusMessage: "too_many_rows" });
  const ids = rows.map((r) => r.case_id as string);

  // メッセージは送受信の日時だけを読む（本文は読まない）
  const firstUser = new Map<string, string>();
  const firstReply = new Map<string, string>();
  const lastMessage = new Map<string, string>();
  const survey = new Map<string, { hurry: string; genre: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [m, a] = await Promise.all([
      db.from("messages").select("case_id, sender, sent_at").in("case_id", chunk).order("sent_at", { ascending: true }),
      db.from("case_survey_answers").select("case_id, survey_question_id, option_label_snapshot").in("case_id", chunk).eq("kind", "chief"),
    ]);
    if (m.error || a.error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const x of m.data ?? []) {
      if (x.sender === "user" && !firstUser.has(x.case_id)) firstUser.set(x.case_id, x.sent_at);
      if (x.sender === "counselor" && !firstReply.has(x.case_id)) firstReply.set(x.case_id, x.sent_at);
      lastMessage.set(x.case_id, x.sent_at);
    }
    for (const x of a.data ?? []) {
      const s = survey.get(x.case_id) ?? { hurry: "", genre: "" };
      // 共通設問のID（マイグレーション user_case_operations）：b2＝相談したい内容、b3＝お急ぎの度合い
      if (x.survey_question_id === "5e000000-0000-4000-8000-0000000000b2") s.genre = x.option_label_snapshot;
      if (x.survey_question_id === "5e000000-0000-4000-8000-0000000000b3") s.hurry = x.option_label_snapshot;
      survey.set(x.case_id, s);
    }
  }
  const [limits, names] = await Promise.all([caseLimits(event, ids), clientNames(event, rows.map((r) => r.client_id))]);

  await writeAudit(event, staff, {
    action: "export.cases",
    targetType: "cases",
    reason: `案件明細 ${range.from}〜${range.to}／${rows.length}件`,
  });

  const header = [
    "案件ID", "付与元", "契約クライアント名", "担当相談員", "利用権付与日時", "初回メッセージ受信日時", "初回返信日時", "最終メッセージ日時",
    "ステータス", "終了の理由", "適用SLA（時間）", "初回返信までの時間（時間）", "SLA遵守（暦時間・仮）", "適用ラリー回数", "残ラリー回数",
    "緊急フラグ", "アンケートの緊急度", "相談ジャンル",
  ];
  const out = rows.map((r) => {
    const l = limits.get(r.case_id);
    const received = firstUser.get(r.case_id) ?? null;
    const replied = firstReply.get(r.case_id) ?? null;
    const hours = received && replied ? (Date.parse(replied) - Date.parse(received)) / 3600000 : null;
    const sla = l?.slaHours ?? 24;
    const status = r.status === "closed" ? "完了" : r.awaiting_reply_since ? "未返信" : "対応中";
    return [
      r.case_id,
      l?.source === "client" ? "企業枠" : "個人課金",
      r.client_id ? names.get(r.client_id) ?? "" : "",
      r.counselor?.name ?? "",
      jstDateTime(r.opened_at),
      jstDateTime(received),
      jstDateTime(replied),
      jstDateTime(lastMessage.get(r.case_id)),
      status,
      formatCloseReasonLabel(r.close_reason),
      sla,
      hours === null ? "" : Math.max(0, hours).toFixed(1),
      hours === null ? "" : hours <= sla ? "遵守" : "超過",
      l?.rallyMax ?? "",
      l ? Math.max(0, l.rallyMax - (r.rally_used as number)) : "",
      r.urgent_flag ? "あり" : "",
      survey.get(r.case_id)?.hurry ?? "",
      survey.get(r.case_id)?.genre ?? "",
    ];
  });
  return sendCsv(event, `cases_${range.from}_${range.to}.csv`, toCsv(header, out));
});

function formatCloseReasonLabel(reason: string | null): string {
  const map: Record<string, string> = { rally: "往復回数の上限", expiry: "有効期間の満了", idle: "無操作による自動終了", manual: "相談員による対応完了" };
  return reason ? map[reason] ?? reason : "";
}
