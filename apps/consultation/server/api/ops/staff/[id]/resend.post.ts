// 相談員・運営管理者に、パスワード再設定のメールを再送する（招待の期限切れ・パスワード忘れ）。運営管理者のみ。理由は必須。
// 宛先は counselors.contact_email（本人のアドレス）。リンクは画面に出さない（server/ops/setupMail.ts）。
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireText } from "../../../../ops/cases";
import { serviceDb } from "../../../../ops/db";
import { maskEmail } from "../../../../ops/mail";
import { createResetToken, sendSetupMail } from "../../../../ops/setupMail";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const counselorId = requireUuid(getRouterParam(event, "id"), "counselor_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const { data, error } = await serviceDb(event).from("counselors").select("name, role, status, contact_email").eq("counselor_id", counselorId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (data.status !== "active") throw createError({ statusCode: 409, statusMessage: "expired_account" });
  if (!data.contact_email) throw createError({ statusCode: 409, statusMessage: "no_contact_email" });

  await writeAudit(event, staff, { action: "staff.setup_link", targetType: "counselors", targetId: counselorId, reason });
  const tokenHash = await createResetToken(event, counselorId, "staff.resend");
  const mailSent = await sendSetupMail(event, { kind: "reset", to: data.contact_email, name: data.name, roleLabel: data.role === "admin" ? "運営管理者" : "相談員", area: "ops", tokenHash, tag: "staff.resend" });
  return { mailSent, to: maskEmail(data.contact_email) };
});
