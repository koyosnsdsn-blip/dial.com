// クライアント管理サイト：自クライアントの管理者アカウントの一覧（要件 7.6.5）。
import { serviceDb } from "../../../ops/db";
import { requireClientAdmin } from "../../../ops/portal";
export default defineEventHandler(async (event) => {
  const admin = await requireClientAdmin(event);
  const { data, error } = await serviceDb(event)
    .from("client_admins")
    .select("admin_id, name, email, status, last_login_at")
    .eq("client_id", admin.clientId)
    .order("name");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (data ?? []).map((r: any) => ({
    adminId: r.admin_id as string,
    name: r.name as string,
    email: r.email as string | null,
    status: r.status as "active" | "expired",
    lastLoginAt: r.last_login_at as string | null,
    isSelf: r.admin_id === admin.userId,
  }));
});
