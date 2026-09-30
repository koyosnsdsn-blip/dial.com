// 通知の受信設定の取得（要件 10.2.2）。保存がない種類は「受け取る」
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const { data, error } = await serviceDb(event).from("notification_settings").select("kind, enabled, show_service_name").eq("account_id", account.userId);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const saved = new Map((data ?? []).map((r: any) => [r.kind as string, r]));
  return {
    // 件名にサービス名を出すかどうか（10.2.1）。全種類で共通の設定として扱う
    showServiceName: (data ?? []).length ? (data ?? []).every((r: any) => r.show_service_name) : true,
    items: NOTIFICATION_KINDS.map((k) => ({ kind: k.kind, label: k.label, enabled: saved.has(k.kind) ? Boolean(saved.get(k.kind).enabled) : true })),
  };
});
