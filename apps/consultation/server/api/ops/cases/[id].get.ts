// 案件詳細（要件 7.3）。案件の情報、アンケートの回答、メッセージ（非表示化済みを除く）、往復回数の調整履歴、緊急対応の記録を返す。
// - 本人の権限で読む（RLS）。担当外・存在しない案件はどちらも 404 とし、存在の有無を区別させない
// - 相談内容の本文を含むため、返す前に必ず監査ログを記録する（要件 7.16）
// - 案件の通番（同一相談者の何件目か）は相談員側にのみ返す（要件 3.4.2）
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { caseLimits, clientNames, deletedCases, frequentUseFlags, quickRestartFlags } from "../../../ops/cases";
import { serviceDb, userDb } from "../../../ops/db";
import { getSettings } from "../../../ops/settings";
import { attachmentsOf } from "../../../utils/attachments";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const db = await userDb(event);

  const { data: row, error } = await db
    .from("cases")
    .select(
      "case_id, account_id, status, close_reason, urgent_flag, opened_at, last_activity_at, closed_at, rally_used, awaiting_reply_since, client_id, counselor_id, counselor:counselors!fk_cases_counselor(name)",
    )
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) {
    console.error("[cases.view] query failed", error.code);
    throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }
  if (!row) throw createError({ statusCode: 404, statusMessage: "not_found" });
  const r: any = row;

  const [{ data: messages, error: msgError }, { data: emergencies, error: emError }, { data: survey, error: svError }] = await Promise.all([
    db.from("messages").select("message_id, sender, body, sent_at").eq("case_id", caseId).is("hidden_at", null).order("sent_at", { ascending: true }),
    db.from("emergency_records").select("record_id, detection, judgment, action_taken, recorded_at, counselor:counselors!fk_emergency_records_counselor(name)").eq("case_id", caseId).order("recorded_at", { ascending: false }),
    // アンケートの回答（回答時点の設問文・選択肢ラベルの複写。要件 3.11・7.3）
    db.from("case_survey_answers").select("survey_question_id, kind, question_text_snapshot, option_label_snapshot").eq("case_id", caseId),
  ]);
  if (msgError || emError || svError) {
    console.error("[cases.view] related query failed", msgError?.code ?? emError?.code ?? svError?.code);
    throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }

  // 閲覧権限を確認できた案件についてのみ、service role で補足情報を読む
  const sdb = serviceDb(event);
  const attached = await attachmentsOf(event, (messages ?? []).map((m: any) => m.message_id as string));
  const { data: reuse } = await sdb.from("reuse_consents").select("status, expires_at").eq("case_id", caseId).maybeSingle();
  const reuseStatus = !reuse ? "unrequested" : reuse.status === "requested" && reuse.expires_at && new Date(reuse.expires_at).getTime() <= Date.now() ? "expired" : (reuse.status as string);
  const limits = (await caseLimits(event, [caseId])).get(caseId);
  const settings = await getSettings(event);
  const [restart, names, frequent, deleted, { data: draft }] = await Promise.all([
    quickRestartFlags(event, [{ case_id: caseId, account_id: r.account_id, opened_at: r.opened_at }], settings.quick_restart_days!),
    clientNames(event, [r.client_id]),
    frequentUseFlags(event, [{ case_id: caseId, account_id: r.account_id }], settings.frequent_days!, settings.frequent_cases!),
    deletedCases(event, [caseId]),
    // 自分の返信の下書き（要件 7.3）
    sdb.from("reply_drafts").select("body, updated_at").eq("case_id", caseId).eq("counselor_id", staff.userId).maybeSingle(),
  ]);
  const [{ data: adjustments }, { count: seq }, { data: others }] = await Promise.all([
    sdb.from("rally_adjustments").select("delta, reason, adjusted_at, counselor:counselors!fk_rally_adjustments_counselor(name)").eq("case_id", caseId).order("adjusted_at", { ascending: false }),
    sdb.from("cases").select("case_id", { count: "exact", head: true }).eq("account_id", r.account_id).lte("opened_at", r.opened_at),
    // 同じ相談者の、ほかの対応中の案件（無償の個人の相談と、企業枠・有料の相談が並行するとき）。終了済みの案件は経緯サマリの対象で、ここには出さない
    sdb
      .from("cases")
      .select("case_id, opened_at, counselor_id, counselor:counselors!fk_cases_counselor(name)")
      .eq("account_id", r.account_id)
      .eq("status", "open")
      .neq("case_id", caseId)
      .order("opened_at", { ascending: true }),
  ]);

  await writeAudit(event, staff, { action: "case.view", targetType: "cases", targetId: caseId });

  const mine = r.counselor_id === staff.userId;
  return {
    caseId: r.case_id as string,
    seq: seq ?? 1,
    // 同じ相談者の、ほかの対応中の案件。担当外の案件は開けない（link=false）。本文は返さない
    otherOpenCases: (others ?? []).map((o: any) => ({
      caseId: o.case_id as string,
      openedAt: o.opened_at as string,
      assigneeName: (o.counselor?.name as string | undefined) ?? null,
      link: o.counselor_id === staff.userId || staff.role === "admin",
    })),
    // 前回の終了から短期間での再開か（支援の要否を判断するための情報。要件 3.4.2）
    quickRestart: restart.has(caseId),
    quickRestartDays: settings.quick_restart_days!,
    clientName: r.client_id ? names.get(r.client_id) ?? null : null,
    // 異常利用の検知（確認の契機。利用の抑止には使わない）
    frequentUse: frequent.has(caseId),
    frequentNote: `${settings.frequent_days}日以内に${settings.frequent_cases}件以上`,
    repeatedAdjustments: (adjustments ?? []).length >= settings.repeated_adjustments!,
    draft: (draft?.body as string | undefined) ?? "",
    // 利用者が削除した案件（やり取りは非表示化済み。物理削除の予定日時まで保持）
    deletedByUser: deleted.get(caseId) ?? null,
    status: r.status as "open" | "closed",
    closeReason: r.close_reason as string | null,
    urgent: r.urgent_flag as boolean,
    openedAt: r.opened_at as string,
    lastActivityAt: r.last_activity_at as string,
    closedAt: r.closed_at as string | null,
    awaitingReplySince: r.awaiting_reply_since as string | null,
    rallyUsed: r.rally_used as number,
    rallyMax: limits?.rallyMax ?? 0,
    slaHours: limits?.slaHours ?? 24,
    kind: limits?.source === "client" ? "corp" : "personal",
    assigneeId: r.counselor_id as string | null,
    assigneeName: (r.counselor?.name as string | undefined) ?? null,
    mine,
    canOperate: r.status === "open" && (mine || staff.role === "admin"),
    // 属性（attr）を先に、主訴（chief）を後に。同じ区分の中は設問IDの順（表示順を安定させるため）
    survey: (survey ?? [])
      .slice()
      .sort((a: any, b: any) => (a.kind === b.kind ? String(a.survey_question_id).localeCompare(String(b.survey_question_id)) : a.kind === "attr" ? -1 : 1))
      .map((a: any) => ({
        kind: a.kind as "attr" | "chief",
        question: a.question_text_snapshot as string,
        answer: a.option_label_snapshot as string,
      })),
    messages: (messages ?? []).map((m: any) => ({
      messageId: m.message_id as string,
      sender: m.sender as "user" | "counselor",
      body: m.body as string,
      sentAt: m.sent_at as string,
      attachments: attached.get(m.message_id) ?? [],
    })),
    // 二次利用同意の状況（要件 9.4）。unrequested＝未依頼
    reuseStatus,
    rallyAdjustments: (adjustments ?? []).map((a: any) => ({
      delta: a.delta as number,
      reason: a.reason as string | null,
      adjustedAt: a.adjusted_at as string,
      byName: (a.counselor?.name as string | undefined) ?? null,
    })),
    emergencyRecords: (emergencies ?? []).map((e: any) => ({
      recordId: e.record_id as string,
      detection: e.detection as string | null,
      judgment: e.judgment as string | null,
      actionTaken: e.action_taken as string | null,
      recordedAt: e.recorded_at as string,
      byName: (e.counselor?.name as string | undefined) ?? null,
    })),
  };
});
