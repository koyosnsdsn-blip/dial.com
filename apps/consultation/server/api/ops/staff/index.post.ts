// 相談員・運営管理者の招待（要件 7.12.1 登録）。運営管理者のみ。
// 招待のメール（server/ops/setupMail.ts）を本人のアドレスへ送り、本人が /ops/accept-invite でパスワードを設定 → 2段階認証を登録する。
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { loginIdToEmail } from "../../../ops/nickname";
import { maskEmail } from "../../../ops/mail";
import { createInviteToken, sendSetupMail } from "../../../ops/setupMail";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<{ email?: unknown; name?: unknown; role?: unknown }>(event);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw createError({ statusCode: 400, statusMessage: "invalid_email" });
  }
  const name = requireText(body?.name, "name", 100);
  const role = body?.role === "admin" ? "admin" : body?.role === "counselor" ? "counselor" : null;
  if (!role) throw createError({ statusCode: 400, statusMessage: "invalid_role" });

  const db = serviceDb(event);
  // Auth には、メールアドレスから作った内部用の識別子（s-…）で登録する。本物のメールアドレスは counselors.contact_email に持つ。
  // 役割ごとに識別子が違うので、同じメールアドレスの相談者・クライアント管理者がいても重複にならない。
  const loginEmail = loginIdToEmail("staff", email, useRuntimeConfig(event).public.nicknameDomain as string);
  const { userId, tokenHash } = await createInviteToken(event, loginEmail, "staff.invite");

  await writeAudit(event, staff, { action: "staff.invite", targetType: "counselors", targetId: userId, reason: role });

  const { error: insertError } = await db.from("counselors").insert({
    counselor_id: userId,
    name,
    role,
    status: "active",
    contact_email: email,
  });
  if (insertError) {
    console.error("[staff.invite] counselors insert failed", insertError.code);
    // 相談員として使えない Auth ユーザーを残さない（残すと、同じアドレスで再招待できなくなる）
    await db.auth.admin.deleteUser(userId).catch(() => {});
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  // 招待メールを本人のアドレスへ送る。送れなかったときも、アカウントは作成済み（再送で届け直せる）
  const mailSent = await sendSetupMail(event, { kind: "invite", to: email, name, roleLabel: role === "admin" ? "運営管理者" : "相談員", area: "ops", tokenHash, tag: "staff.invite" });
  return { counselorId: userId, mailSent, to: maskEmail(email) };
});
