// クライアント管理者アカウントの失効・再有効化（要件 7.10.6）。運営管理者のみ。理由は必須。
// 有効な管理者が1人もいなくなる失効はできない（DBのトリガで拒否）。
import { writeAudit } from "../../../../../ops/audit";
import { requireStaff } from "../../../../../ops/auth";
import { requireText } from "../../../../../ops/cases";
import { setClientAdminStatus } from "../../../../../ops/portal";
import { requireUuid } from "../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const adminId = requireUuid(getRouterParam(event, "aid"), "admin_id");
  const body = await readBody<{ status?: unknown; reason?: unknown }>(event);
  if (body?.status !== "active" && body?.status !== "expired") throw createError({ statusCode: 400, statusMessage: "invalid_status" });
  const reason = requireText(body?.reason, "reason", 500);

  await writeAudit(event, staff, {
    action: body.status === "expired" ? "client.admin.expire" : "client.admin.restore",
    targetType: "client_admins",
    targetId: adminId,
    reason,
  });
  await setClientAdminStatus(event, clientId, adminId, body.status);
  return { ok: true };
});
