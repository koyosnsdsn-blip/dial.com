// 招待コードの再発行・失効（要件 7.10.4）。運営管理者のみ。理由は必須。
// 流出時に備えた操作。再発行すると、古いコードでは新たに登録できなくなる。
// すでに所属が付いているアカウントには影響しない（所属はアカウント側に保持しているため）。
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireText } from "../../../../ops/cases";
import { generateInviteCode } from "../../../../ops/clients";
import { serviceDb } from "../../../../ops/db";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const body = await readBody<{ action?: unknown; reason?: unknown }>(event);
  if (body?.action !== "reissue" && body?.action !== "revoke") throw createError({ statusCode: 400, statusMessage: "invalid_action" });
  const reason = requireText(body?.reason, "reason", 500);

  const db = serviceDb(event);
  const { data: cur, error } = await db.from("clients").select("client_id, status").eq("client_id", clientId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!cur) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (cur.status === "closed") throw createError({ statusCode: 409, statusMessage: "client_closed" });

  // コードそのものは監査ログに残さない
  await writeAudit(event, staff, {
    action: body.action === "reissue" ? "client.invite.reissue" : "client.invite.revoke",
    targetType: "clients",
    targetId: clientId,
    reason,
  });

  const inviteCode = body.action === "reissue" ? generateInviteCode() : null;
  const { error: updateError } = await db.from("clients").update({ invite_code: inviteCode }).eq("client_id", clientId);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { inviteCode };
});
