// クライアント管理サイト：自クライアントの管理者アカウントの追加（要件 7.6.5）。
// 追加先は、必ずログイン中の管理者自身のクライアント（リクエストからクライアントIDを受け取らない）。
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { inviteClientAdmin, requireClientAdmin, requireEmail, writePortalAudit } from "../../../ops/portal";
export default defineEventHandler(async (event) => {
  const admin = await requireClientAdmin(event);
  const body = await readBody<{ email?: unknown; name?: unknown }>(event);
  const email = requireEmail(body?.email);
  const name = requireText(body?.name, "name", 100);

  const { data: client } = await serviceDb(event).from("clients").select("status").eq("client_id", admin.clientId).maybeSingle();
  if (!client || client.status === "closed") throw createError({ statusCode: 409, statusMessage: "client_closed" });

  await writePortalAudit(event, admin, { action: "portal.admin.invite", targetType: "client_admins", targetId: admin.clientId });
  const adminId = await inviteClientAdmin(event, admin.clientId, email, name);
  return { adminId };
});
