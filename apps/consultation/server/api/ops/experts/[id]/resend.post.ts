// 先生に、パスワード再設定のメールを再送する（招待の期限切れ・パスワード忘れ）。運営管理者のみ。理由は必須。
// 宛先は experts.contact_email（本人のアドレス）。リンクは画面に出さない（server/ops/setupMail.ts）。
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireText } from "../../../../ops/cases";
import { serviceDb } from "../../../../ops/db";
import { maskEmail } from "../../../../ops/mail";
import { createResetToken, sendSetupMail } from "../../../../ops/setupMail";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const expertId = requireUuid(getRouterParam(event, "id"), "expert_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const { data, error } = await serviceDb(event).from("experts").select("display_name, status, contact_email").eq("expert_id", expertId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (data.status !== "active") throw createError({ statusCode: 409, statusMessage: "expired_account" });
  if (!data.contact_email) throw createError({ statusCode: 409, statusMessage: "no_contact_email" });

  await writeAudit(event, staff, { action: "expert.setup_link", targetType: "experts", targetId: expertId, reason });
  const tokenHash = await createResetToken(event, expertId, "expert.resend");
  const mailSent = await sendSetupMail(event, { kind: "reset", to: data.contact_email, name: data.display_name, roleLabel: "先生", area: "ops", tokenHash, tag: "expert.resend" });
  return { mailSent, to: maskEmail(data.contact_email) };
});
