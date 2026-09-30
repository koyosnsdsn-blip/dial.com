// クライアント管理サイト：自クライアントの管理者アカウントの削除（失効。要件 7.6.5）。
// 自分自身は削除できない。有効な管理者が1人もいなくなる削除もできない（DBのトリガで拒否）。
export default defineEventHandler(async (event) => {
  const admin = await requireClientAdmin(event);
  const adminId = requireUuid(getRouterParam(event, "aid"), "admin_id");
  if (adminId === admin.userId) throw createError({ statusCode: 400, statusMessage: "cannot_change_self" });
  await writePortalAudit(event, admin, { action: "portal.admin.expire", targetType: "client_admins", targetId: adminId });
  // 自クライアントの行に限定して更新する（他クライアントの管理者IDを指定しても 404）
  await setClientAdminStatus(event, admin.clientId, adminId, "expired");
  return { ok: true };
});
