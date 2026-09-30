// クライアント管理者アカウントの一覧（要件 7.10.6）。運営管理者のみ。
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const { data, error } = await serviceDb(event)
    .from("client_admins")
    .select("admin_id, name, email, status, last_login_at")
    .eq("client_id", clientId)
    .order("name");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  await writeAudit(event, staff, { action: "client.admin.list", targetType: "client_admins", targetId: clientId });
  return (data ?? []).map((r: any) => ({
    adminId: r.admin_id as string,
    name: r.name as string,
    email: r.email as string | null,
    status: r.status as "active" | "expired",
    lastLoginAt: r.last_login_at as string | null,
  }));
});
