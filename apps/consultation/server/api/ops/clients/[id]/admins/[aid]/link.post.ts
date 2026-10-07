// 【暫定】クライアント管理者に、パスワードを設定し直すリンクを発行して画面に返す。運営管理者のみ。理由は必須。
// メール送信の仕組みが入ったら、メールで送る形に置き換える（server/ops/setupLink.ts）。
import { writeAudit } from "../../../../../../ops/audit";
import { requireStaff } from "../../../../../../ops/auth";
import { requireText } from "../../../../../../ops/cases";
import { clientAdminResetLink } from "../../../../../../ops/portal";
import { SETUP_LINK_NOTE } from "../../../../../../ops/setupLink";
import { requireUuid } from "../../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const adminId = requireUuid(getRouterParam(event, "aid"), "admin_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);
  await writeAudit(event, staff, { action: "client.admin.setup_link", targetType: "client_admins", targetId: adminId, reason });
  const link = await clientAdminResetLink(event, clientId, adminId);
  return { link, note: SETUP_LINK_NOTE };
});
