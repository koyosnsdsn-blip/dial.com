// 【暫定】先生に、パスワードを設定し直すリンクを発行して画面に返す（招待リンクの期限切れ・パスワード忘れ）。運営管理者のみ。理由は必須。
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireText } from "../../../../ops/cases";
import { serviceDb } from "../../../../ops/db";
import { SETUP_LINK_NOTE, createResetLink } from "../../../../ops/setupLink";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const expertId = requireUuid(getRouterParam(event, "id"), "expert_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const { data, error } = await serviceDb(event).from("experts").select("status").eq("expert_id", expertId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (data.status !== "active") throw createError({ statusCode: 409, statusMessage: "expired_account" });

  await writeAudit(event, staff, { action: "expert.setup_link", targetType: "experts", targetId: expertId, reason });
  const link = await createResetLink(event, expertId, "expert.setup_link");
  return { link, note: SETUP_LINK_NOTE };
});
