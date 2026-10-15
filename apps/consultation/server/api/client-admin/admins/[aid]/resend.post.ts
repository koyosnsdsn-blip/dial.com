// クライアント管理サイト：同じクライアントの管理者に、パスワード再設定のメールを再送する。
// メールは、対象の管理者自身のアドレス（client_admins.email）へ送る。リンクは画面に出さない（server/ops/setupMail.ts）。
// 対象は、ログイン中の管理者自身のクライアントの有効な管理者に限る。
import { clientAdminResend, requireClientAdmin, writePortalAudit } from "../../../../ops/portal";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const admin = await requireClientAdmin(event);
  const adminId = requireUuid(getRouterParam(event, "aid"), "admin_id");
  await writePortalAudit(event, admin, { action: "portal.admin.setup_link", targetType: "client_admins", targetId: adminId });
  return clientAdminResend(event, admin.clientId, adminId);
});
