// 案件詳細（要件 7.3）。案件の情報とメッセージ（非表示化済みを除く）を返す。
// - 本人の権限で読む（RLS）。担当外・存在しない案件はどちらも 404 とし、存在の有無を区別させない
// - 相談内容の本文を含むため、返す前に必ず監査ログを記録する（要件 7.16）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const db = await userDb(event);

  const { data: row, error } = await db
    .from("cases")
    .select("case_id, status, close_reason, urgent_flag, opened_at, last_activity_at, closed_at, rally_used, client_id, counselor_id, counselor:counselors(name)")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) {
    console.error("[cases.view] query failed", error.code);
    throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: "not_found" });
  }

  const { data: messages, error: msgError } = await db
    .from("messages")
    .select("message_id, sender, body, sent_at")
    .eq("case_id", caseId)
    .is("hidden_at", null)
    .order("sent_at", { ascending: true });
  if (msgError) {
    console.error("[cases.view] messages query failed", msgError.code);
    throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }

  await writeAudit(event, staff, { action: "case.view", targetType: "cases", targetId: caseId });

  const r: any = row;
  return {
    caseId: r.case_id as string,
    status: r.status as "open" | "closed",
    closeReason: r.close_reason as string | null,
    urgent: r.urgent_flag as boolean,
    openedAt: r.opened_at as string,
    lastActivityAt: r.last_activity_at as string,
    closedAt: r.closed_at as string | null,
    rallyUsed: r.rally_used as number,
    kind: r.client_id ? "corp" : "personal",
    assigneeName: (r.counselor?.name as string | undefined) ?? null,
    mine: r.counselor_id === staff.userId,
    messages: (messages ?? []).map((m: any) => ({
      messageId: m.message_id as string,
      sender: m.sender as "user" | "counselor",
      body: m.body as string,
      sentAt: m.sent_at as string,
    })),
  };
});
