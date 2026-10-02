// クライアント管理サイト：ログイン中のクライアント管理者と、所属クライアントの基本情報（要件 7.6.1・7.6.2）。
// 返すのは、クライアントの名称・契約類型・招待コード（従業員への案内用）のみ。相談に関する情報は返さない。
import { serviceDb } from "../../ops/db";
import { requireClientAdmin, writePortalAudit } from "../../ops/portal";
export default defineEventHandler(async (event) => {
  const admin = await requireClientAdmin(event);
  const db = serviceDb(event);
  const { data: client, error } = await db
    .from("clients")
    .select("name, contract_type, status, invite_code, feature_consult")
    .eq("client_id", admin.clientId)
    .maybeSingle();
  if (error || !client) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  await writePortalAudit(event, admin, { action: "portal.view", targetType: "clients", targetId: admin.clientId });
  await db.from("client_admins").update({ last_login_at: new Date().toISOString() }).eq("admin_id", admin.userId);
  return {
    userId: admin.userId,
    name: admin.name,
    clientName: client.name as string,
    contractType: client.contract_type as "corp" | "muni",
    clientStatus: client.status as "prep" | "active" | "closed",
    // 招待コードは、有効なクライアントのときだけ見せる
    inviteCode: client.status === "active" ? (client.invite_code as string | null) : null,
    featureConsult: client.feature_consult as boolean,
  };
});
