// 案件一覧（ダッシュボード 要件 7.1、案件一覧 7.2）。
// - 本人の権限で読むため、相談員は担当案件のみ、運営管理者は全案件が返る（RLS）
// - 並び順：緊急フラグを最上位に固定し、以降は返信待ちの起点が古い順（待たせている案件が上）、
//   返信待ちでない案件は最終更新が古い順
// - メッセージ本文は含めない（本文は案件詳細でのみ返す）
// - 参照の事実を監査ログに記録してから返す
//
// 絞り込み（クエリ）：
//   status   = open（既定）| closed | all
//   assignee = all（既定）| me | unassigned
//   kind     = all（既定）| personal | corp
//   urgent   = 1 で緊急のみ
//   client   = 契約クライアントのID
//   from, to = 利用権の付与日（＝案件の開始日。日本時間の日付 YYYY-MM-DD）の範囲
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { HURRY_ANSWER, caseLimits, clientNames, deletedCases, frequentUseFlags, quickRestartFlags } from "../../../ops/cases";
import { userDb } from "../../../ops/db";
import { getSettings } from "../../../ops/settings";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const q = getQuery(event);
  const status = q.status === "closed" || q.status === "all" ? q.status : "open";
  const assignee = q.assignee === "me" || q.assignee === "unassigned" ? q.assignee : "all";
  const kind = q.kind === "personal" || q.kind === "corp" ? q.kind : "all";
  const urgentOnly = q.urgent === "1";
  const clientId = typeof q.client === "string" && q.client ? requireUuid(q.client, "client") : null;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const from = typeof q.from === "string" && day.test(q.from) ? q.from : null;
  const to = typeof q.to === "string" && day.test(q.to) ? q.to : null;

  let request = (await userDb(event))
    .from("cases")
    .select("case_id, account_id, status, close_reason, urgent_flag, opened_at, last_activity_at, closed_at, rally_used, awaiting_reply_since, client_id, counselor_id, counselor:counselors!fk_cases_counselor(name)")
    .limit(300);
  if (status !== "all") request = request.eq("status", status);
  if (assignee === "me") request = request.eq("counselor_id", staff.userId);
  if (assignee === "unassigned") request = request.is("counselor_id", null);
  if (kind === "personal") request = request.is("client_id", null);
  if (kind === "corp") request = request.not("client_id", "is", null);
  if (urgentOnly) request = request.eq("urgent_flag", true);
  if (clientId) request = request.eq("client_id", clientId);
  if (from) request = request.gte("opened_at", `${from}T00:00:00+09:00`);
  if (to) request = request.lte("opened_at", `${to}T23:59:59.999+09:00`);

  const { data, error } = await request;
  if (error) {
    console.error("[cases.list] query failed", error.code);
    throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }
  const rows = (data ?? []) as any[];
  const ids = rows.map((r) => r.case_id as string);
  const limits = await caseLimits(event, ids);

  // 緊急度の自己申告（アンケートの主訴）。本人の権限（RLS）で読む
  const hurry = new Set<string>();
  if (ids.length > 0) {
    const { data: answers, error: ansError } = await (await userDb(event))
      .from("case_survey_answers")
      .select("case_id")
      .in("case_id", ids)
      .eq("kind", "chief")
      .eq("option_label_snapshot", HURRY_ANSWER);
    if (ansError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const a of answers ?? []) hurry.add(a.case_id);
  }
  const settings = await getSettings(event);
  const [restart, names, frequent, deleted] = await Promise.all([
    quickRestartFlags(event, rows, settings.quick_restart_days!),
    clientNames(event, rows.map((r) => r.client_id)),
    frequentUseFlags(event, rows, settings.frequent_days!, settings.frequent_cases!),
    deletedCases(event, ids),
  ]);

  await writeAudit(event, staff, { action: "case.list", targetType: "cases" });

  const items = rows.map((r) => {
    const l = limits.get(r.case_id);
    const rallyMax = l?.rallyMax ?? 0;
    return {
      caseId: r.case_id as string,
      status: r.status as "open" | "closed",
      closeReason: r.close_reason as string | null,
      urgent: r.urgent_flag as boolean,
      openedAt: r.opened_at as string,
      lastActivityAt: r.last_activity_at as string,
      closedAt: r.closed_at as string | null,
      awaitingReplySince: r.awaiting_reply_since as string | null,
      rallyUsed: r.rally_used as number,
      rallyMax,
      rallyRemaining: Math.max(0, rallyMax - (r.rally_used as number)),
      slaHours: l?.slaHours ?? 24,
      kind: l?.source === "client" ? "corp" : "personal",
      assigneeName: (r.counselor?.name as string | undefined) ?? null,
      mine: r.counselor_id === staff.userId,
      clientName: r.client_id ? names.get(r.client_id) ?? null : null,
      hurry: hurry.has(r.case_id),
      quickRestart: restart.has(r.case_id),
      frequentUse: frequent.has(r.case_id),
      deletedByUser: deleted.has(r.case_id),
    };
  });

  const t = (s: string | null) => (s ? new Date(s).getTime() : Number.POSITIVE_INFINITY);
  items.sort((a, b) => {
    const au = a.urgent && a.status === "open" ? 0 : 1;
    const bu = b.urgent && b.status === "open" ? 0 : 1;
    if (au !== bu) return au - bu;
    const ao = a.status === "open" ? 0 : 1;
    const bo = b.status === "open" ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const aw = t(a.awaitingReplySince);
    const bw = t(b.awaitingReplySince);
    if (aw !== bw) return aw - bw;
    return new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime();
  });
  return items;
});
