// 契約の終了（要件 3.10.5・7.10.9）。運営管理者のみ。理由は必須。
// - ステータスを「終了」にし、所属する全アカウントの所属を一括して解除する（無料会員として継続）
// - 対応中の相談は終了まで継続する。過去の相談記録は本人に帰属し、失われない
// - 取り消せない操作のため、クライアント名の入力による確認を必須とする
// 未実装：所属解除の案内メール（8.6.1.2。メール配信が未決：No.59）、クライアント管理者アカウントの失効
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const body = await readBody<{ reason?: unknown; confirmName?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const db = serviceDb(event);
  const { data: cur, error } = await db.from("clients").select("name, status").eq("client_id", clientId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!cur) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (cur.status === "closed") throw createError({ statusCode: 409, statusMessage: "client_closed" });
  if (typeof body?.confirmName !== "string" || body.confirmName.trim() !== cur.name) {
    throw createError({ statusCode: 400, statusMessage: "confirm_name_mismatch" });
  }

  await writeAudit(event, staff, { action: "client.close", targetType: "clients", targetId: clientId, reason });

  const { data, error: rpcErr } = await db.rpc("admin_close_client", { p_client_id: clientId });
  if (rpcErr) {
    if ((rpcErr.message ?? "").includes("already_closed")) throw createError({ statusCode: 409, statusMessage: "client_closed" });
    rpcError(rpcErr);
  }
  return { closed: true, detached: (data as any).detached as number };
});
