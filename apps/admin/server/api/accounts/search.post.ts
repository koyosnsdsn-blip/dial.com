// 利用者アカウントの照会（要件 7.12.2）。運営管理者のみ。
// - 検索はメールアドレスの完全一致のみ。部分一致・氏名での検索は提供しない
//   （無関係な利用者の一覧を表示させる手段になるため。氏名はそもそも保持していない）
// - 相談内容・相談サマリは返さない。件数だけを返す
// - メールアドレスを URL やアクセスログに残さないよう、POST の本文で受け取る。監査ログにも検索語は残さない
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<{ email?: unknown }>(event);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw createError({ statusCode: 400, statusMessage: "invalid_email" });
  }

  const db = serviceDb(event);
  const { data: a, error } = await db
    .from("accounts")
    .select("account_id, email, tier, client_id, posting_suspended, created_at, deleted_at")
    .eq("email", email)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  await writeAudit(event, staff, {
    action: "account.lookup",
    targetType: "accounts",
    targetId: a?.account_id ?? null,
    reason: a ? null : "該当なし",
  });
  if (!a) return { found: false as const };

  const [{ count: caseCount }, { count: openCount }, { count: questionCount }, names] = await Promise.all([
    db.from("cases").select("case_id", { count: "exact", head: true }).eq("account_id", a.account_id),
    db.from("cases").select("case_id", { count: "exact", head: true }).eq("account_id", a.account_id).eq("status", "open"),
    db.from("questions").select("*", { count: "exact", head: true }).eq("account_id", a.account_id),
    clientNames(event, [a.client_id]),
  ]);

  return {
    found: true as const,
    account: {
      accountId: a.account_id as string,
      email: a.email as string | null,
      tier: a.tier as "free" | "paid" | "member",
      clientName: a.client_id ? names.get(a.client_id) ?? null : null,
      postingSuspended: a.posting_suspended as boolean,
      createdAt: a.created_at as string,
      deleted: Boolean(a.deleted_at),
      caseCount: caseCount ?? 0,
      openCaseCount: openCount ?? 0,
      questionCount: questionCount ?? 0,
    },
  };
});
