// 通知の受信設定の保存（要件 10.2.2）。すべての任意通知を止めることもできる
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const body = await readBody<{ items?: unknown; showServiceName?: unknown }>(event);
  if (!Array.isArray(body?.items)) throw createError({ statusCode: 400, statusMessage: "invalid_items" });
  const show = body.showServiceName !== false;
  const wanted = new Map<string, boolean>();
  for (const it of body.items as any[]) {
    if (typeof it?.kind === "string" && typeof it?.enabled === "boolean") wanted.set(it.kind, it.enabled);
  }
  const rows = NOTIFICATION_KINDS.map((k) => ({
    account_id: account.userId,
    kind: k.kind,
    enabled: wanted.has(k.kind) ? wanted.get(k.kind)! : true,
    show_service_name: show,
  }));
  const { error } = await serviceDb(event).from("notification_settings").upsert(rows, { onConflict: "account_id,kind" });
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
