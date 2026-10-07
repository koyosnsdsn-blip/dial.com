// 【暫定】相談員・運営管理者に、パスワードを設定し直すリンクを発行して画面に返す（招待リンクの期限切れ・パスワード忘れ）。運営管理者のみ。理由は必須。
// メール送信の仕組みが入ったら、メールで送る形に置き換える（server/ops/setupLink.ts）。
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireText } from "../../../../ops/cases";
import { serviceDb } from "../../../../ops/db";
import { SETUP_LINK_NOTE, createResetLink } from "../../../../ops/setupLink";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const counselorId = requireUuid(getRouterParam(event, "id"), "counselor_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const { data, error } = await serviceDb(event).from("counselors").select("status").eq("counselor_id", counselorId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (data.status !== "active") throw createError({ statusCode: 409, statusMessage: "expired_account" });

  await writeAudit(event, staff, { action: "staff.setup_link", targetType: "counselors", targetId: counselorId, reason });
  const link = await createResetLink(event, counselorId, "staff.setup_link");
  return { link, note: SETUP_LINK_NOTE };
});
