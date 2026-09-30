// 招待コードによる所属の紐付け（要件 8.5）
// - コードが一致し、契約ステータスが「有効」のクライアントにだけ紐付ける（「準備中」は不可：要件 7.10.9）
// - 総当たりを防ぐため、失敗を監査ログに残し、1時間あたりの失敗回数を制限する
// 【仮】失敗の上限（1時間に10回）は暫定値。クライアント管理者による承認を要する設定（要件 8.5）は未実装
const MAX_FAILURES_PER_HOUR = 10;

export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const body = await readBody<{ code?: unknown }>(event);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (code.length === 0 || code.length > 200) {
    throw createError({ statusCode: 400, statusMessage: "invalid_code" });
  }

  const db = serviceDb(event);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("audit_logs")
    .select("log_id", { count: "exact", head: true })
    .eq("actor_type", "account")
    .eq("actor_id", account.userId)
    .eq("action", "client.link.failed")
    .gte("acted_at", since);
  if (countError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if ((count ?? 0) >= MAX_FAILURES_PER_HOUR) {
    throw createError({ statusCode: 429, statusMessage: "too_many_attempts" });
  }

  const { error } = await db.rpc("user_link_client", { p_account_id: account.userId, p_code: code });
  if (error) {
    if ((error.message ?? "").includes("invalid_code")) {
      // 入力されたコードそのものは記録しない
      await writeAudit(event, account, { action: "client.link.failed", targetType: "accounts", targetId: account.userId });
    }
    rpcError(error);
  }
  await writeAudit(event, account, { action: "client.link", targetType: "accounts", targetId: account.userId });
  return { linked: true };
});
