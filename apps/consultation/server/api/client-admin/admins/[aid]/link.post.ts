// 【暫定】クライアント管理サイト：同じクライアントの管理者に、パスワードを設定し直すリンクを発行して画面に返す。
// 対象は、ログイン中の管理者自身のクライアントの有効な管理者に限る。メール送信の仕組みが入ったら置き換える（server/ops/setupLink.ts）。
import { clientAdminResetLink, requireClientAdmin, writePortalAudit } from "../../../../ops/portal";
import { SETUP_LINK_NOTE } from "../../../../ops/setupLink";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const admin = await requireClientAdmin(event);
  const adminId = requireUuid(getRouterParam(event, "aid"), "admin_id");
  await writePortalAudit(event, admin, { action: "portal.admin.setup_link", targetType: "client_admins", targetId: adminId });
  const link = await clientAdminResetLink(event, admin.clientId, adminId);
  return { link, note: SETUP_LINK_NOTE };
});
