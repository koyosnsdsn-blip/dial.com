// クライアント管理者アカウントの発行（要件 7.10.6）。運営管理者のみ。理由は必須。
// 初回の管理者は運営側が発行する。2人目以降は、クライアント管理者自身もクライアント管理サイトから追加できる。
import { writeAudit } from "../../../../../ops/audit";
import { requireStaff } from "../../../../../ops/auth";
import { requireText } from "../../../../../ops/cases";
import { serviceDb } from "../../../../../ops/db";
import { inviteClientAdmin, requireEmail } from "../../../../../ops/portal";
import { requireUuid } from "../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const body = await readBody<{ email?: unknown; name?: unknown; reason?: unknown }>(event);
  const email = requireEmail(body?.email);
  const name = requireText(body?.name, "name", 100);
  const reason = requireText(body?.reason, "reason", 500);

  const { data: cur, error } = await serviceDb(event).from("clients").select("status").eq("client_id", clientId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!cur) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (cur.status === "closed") throw createError({ statusCode: 409, statusMessage: "client_closed" });

  // メールアドレスは監査ログに残さない
  await writeAudit(event, staff, { action: "client.admin.invite", targetType: "client_admins", targetId: clientId, reason });
  const adminId = await inviteClientAdmin(event, clientId, email, name);
  return { adminId };
});
