// クライアント管理者に、パスワード再設定のメールを再送する。運営管理者のみ。理由は必須。
// 宛先は client_admins.email（本人のアドレス）。リンクは画面に出さない（server/ops/setupMail.ts）。
import { writeAudit } from "../../../../../../ops/audit";
import { requireStaff } from "../../../../../../ops/auth";
import { requireText } from "../../../../../../ops/cases";
import { clientAdminResend } from "../../../../../../ops/portal";
import { requireUuid } from "../../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const adminId = requireUuid(getRouterParam(event, "aid"), "admin_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);
  await writeAudit(event, staff, { action: "client.admin.setup_link", targetType: "client_admins", targetId: adminId, reason });
  return clientAdminResend(event, clientId, adminId);
});
