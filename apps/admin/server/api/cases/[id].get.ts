// 案件詳細（要件 7.3）。案件の情報、メッセージ（非表示化済みを除く）、往復回数の調整履歴、緊急対応の記録を返す。
// - 本人の権限で読む（RLS）。担当外・存在しない案件はどちらも 404 とし、存在の有無を区別させない
// - 相談内容の本文を含むため、返す前に必ず監査ログを記録する（要件 7.16）
// - 案件の通番（同一相談者の何件目か）は相談員側にのみ返す（要件 3.4.2）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const db = await userDb(event);

  const { data: row, error } = await db
    .from("cases")
    .select(
      "case_id, account_id, status, close_reason, urgent_flag, opened_at, last_activity_at, closed_at, rally_used, awaiting_reply_since, client_id, counselor_id, counselor:counselors(name)",
    )
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) {
    console.error("[cases.view] query failed", error.code);
    throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }
  if (!row) throw createError({ statusCode: 404, statusMessage: "not_found" });
  const r: any = row;

  const [{ data: messages, error: msgError }, { data: emergencies, error: emError }] = await Promise.all([
    db.from("messages").select("message_id, sender, body, sent_at").eq("case_id", caseId).is("hidden_at", null).order("sent_at", { ascending: true }),
    db.from("emergency_records").select("record_id, detection, judgment, action_taken, recorded_at, counselor:counselors(name)").eq("case_id", caseId).order("recorded_at", { ascending: false }),
  ]);
  if (msgError || emError) {
    console.error("[cases.view] related query failed", msgError?.code ?? emError?.code);
    throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }

  // 閲覧権限を確認できた案件についてのみ、service role で補足情報を読む
  const sdb = serviceDb(event);
  const limits = (await caseLimits(event, [caseId])).get(caseId);
  const [{ data: adjustments }, { count: seq }] = await Promise.all([
    sdb.from("rally_adjustments").select("delta, reason, adjusted_at, counselor:counselors(name)").eq("case_id", caseId).order("adjusted_at", { ascending: false }),
    sdb.from("cases").select("case_id", { count: "exact", head: true }).eq("account_id", r.account_id).lte("opened_at", r.opened_at),
  ]);

  await writeAudit(event, staff, { action: "case.view", targetType: "cases", targetId: caseId });

  const mine = r.counselor_id === staff.userId;
  return {
    caseId: r.case_id as string,
    seq: seq ?? 1,
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
    messages: (messages ?? []).map((m: any) => ({
      messageId: m.message_id as string,
      sender: m.sender as "user" | "counselor",
      body: m.body as string,
      sentAt: m.sent_at as string,
    })),
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
