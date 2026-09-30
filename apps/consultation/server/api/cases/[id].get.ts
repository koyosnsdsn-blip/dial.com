// 相談のやり取り（要件 3.2.1・3.4）。対応中・終了後のどちらも本人は閲覧できる。
// - 本人の案件のみ（ビュー my_cases と RLS）。他人の案件・存在しない案件はどちらも 404
// - 相談内容の本文を含むため、返す前に必ず監査ログを記録する
// - 返さないもの：担当者の氏名・識別子（3.6.1）、往復の回数（3.3.1）、案件の通番（3.4.2）
// - 担当の継続性は状態だけを返す（「前回と同じ担当」かどうか。3.6.1）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const c = await requireOwnCase(event, account, caseId);
  const db = await userDb(event);

  const { data: messages, error: msgError } = await db
    .from("messages")
    .select("message_id, sender, body, sent_at")
    .eq("case_id", caseId)
    .is("hidden_at", null)
    .order("sent_at", { ascending: true });
  if (msgError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  // 返信の目安（利用権付与時点の複写値）と契約類型は、本人の案件と確認できた後に service role で読む
  const sdb = serviceDb(event);
  const [{ data: ent }, { data: client }, m] = await Promise.all([
    sdb.from("cases").select("entitlement:entitlements(sla_hours)").eq("case_id", caseId).maybeSingle(),
    c.client_id ? sdb.from("clients").select("contract_type").eq("client_id", c.client_id).maybeSingle() : Promise.resolve({ data: null }),
    membership(event, account),
  ]);

  await writeAudit(event, account, { action: "case.view", targetType: "cases", targetId: caseId });
  const attached = await attachmentsOf(event, (messages ?? []).map((x: any) => x.message_id as string));

  // 二次利用（Q&A としての公開）への同意の依頼が届いているか（要件 9.4）
  const { data: reuse } = await sdb.from("reuse_consents").select("status, expires_at").eq("case_id", caseId).maybeSingle();
  const reuseRequested = reuse?.status === "requested" && (!reuse.expires_at || new Date(reuse.expires_at).getTime() > Date.now());

  // 既読の記録（未読の返信の表示を消す）。失敗しても表示は続ける
  const { error: readError } = await sdb
    .from("case_reads")
    .upsert({ case_id: caseId, account_read_at: new Date().toISOString() }, { onConflict: "case_id" });
  if (readError) console.error("[cases.view] failed to record read", readError.code);

  return {
    caseId: c.case_id,
    status: c.status,
    closeReason: c.close_reason,
    openedAt: c.opened_at,
    closedAt: c.closed_at,
    // 前回の案件と担当が同じかどうか（DBのビューが状態だけを返す。担当者の識別子はこのAPIに届かない）
    continuity: c.continuity,
    // このままやり取りがない場合に自動で終了する日時（企業枠のみ。返信待ちの間は null）。予告の表示に使う（要件 3.2.6）
    idleCloseAt: c.idle_close_at,
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
      attachments: attached.get(x.message_id) ?? [],
    })),
    reuseRequested,
  };
});
