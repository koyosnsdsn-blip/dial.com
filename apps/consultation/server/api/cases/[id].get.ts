// 相談のやり取り（要件 3.2.1・3.4）。対応中・終了後のどちらも本人は閲覧できる。
// - 本人の案件のみ（RLS＋account_id の明示）。他人の案件・存在しない案件はどちらも 404
// - 相談内容の本文を含むため、返す前に必ず監査ログを記録する
// - 返さないもの：担当者の氏名・識別子（3.6.1）、往復の回数（3.3.1）、案件の通番（3.4.2）
// - 担当の継続性は状態だけを返す（「前回と同じ担当」かどうか。3.6.1）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const c = await requireOwnCase(event, account, caseId);
  const db = await userDb(event);

  const [{ data: messages, error: msgError }, { data: mine, error: caseError }] = await Promise.all([
    db.from("messages").select("message_id, sender, body, sent_at").eq("case_id", caseId).is("hidden_at", null).order("sent_at", { ascending: true }),
    db.from("cases").select("case_id, counselor_id, opened_at").eq("account_id", account.userId).order("opened_at", { ascending: true }),
  ]);
  if (msgError || caseError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  // 前回の案件と担当が同じかどうか（識別子はサーバー内の比較にだけ使い、応答には含めない）
  let continuity: "same" | "changed" | null = null;
  const list = mine ?? [];
  const index = list.findIndex((x: any) => x.case_id === caseId);
  if (index > 0) {
    const current = list[index].counselor_id as string | null;
    const previous = list[index - 1].counselor_id as string | null;
    if (current && previous) continuity = current === previous ? "same" : "changed";
  }

  // 返信の目安（利用権付与時点の複写値）と契約類型は、本人の案件と確認できた後に service role で読む
  const sdb = serviceDb(event);
  const [{ data: ent }, { data: client }, m] = await Promise.all([
    sdb.from("cases").select("entitlement:entitlements(sla_hours)").eq("case_id", caseId).maybeSingle(),
    c.client_id ? sdb.from("clients").select("contract_type").eq("client_id", c.client_id).maybeSingle() : Promise.resolve({ data: null }),
    membership(event, account),
  ]);

  await writeAudit(event, account, { action: "case.view", targetType: "cases", targetId: caseId });

  return {
    caseId: c.case_id,
    status: c.status,
    closeReason: c.close_reason,
    openedAt: c.opened_at,
    closedAt: c.closed_at,
    continuity,
    slaHours: ((ent as any)?.entitlement?.sla_hours as number | undefined) ?? 24,
    // 自治体委託型は、委託元へ報告される旨を画面に常時表示する（要件 3.12.4）
    contractType: ((client as any)?.contract_type as "corp" | "muni" | undefined) ?? null,
    // 終了後の画面から新しい相談を始められるか（要件 3.4.2）
    canRestart: c.status === "closed" && m.canConsult,
    messages: (messages ?? []).map((x: any) => ({
      messageId: x.message_id as string,
      sender: x.sender as "user" | "counselor",
      body: x.body as string,
      sentAt: x.sent_at as string,
    })),
  };
});
