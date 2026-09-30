// 相談員・運営管理者の招待（要件 7.12.1 登録）。運営管理者のみ。
// Supabase Auth の招待メールを送り、本人が /accept-invite でパスワードを設定 → 2段階認証を登録する。
//
// 注意（dev）：Supabase 標準のメール送信は、Supabase の組織メンバーのアドレスにしか届かず、送信数の上限も小さい。
// 本番運用には独自のメール配信サービス（SMTP）の設定が必要（未決事項 No.59）。
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
  const origin = getRequestURL(event).origin;
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/accept-invite` });
  if (error || !data?.user) {
    const msg = error?.message ?? "";
    console.error("[staff.invite] failed", error?.status, msg);
    if (/already|registered|exists/i.test(msg)) throw createError({ statusCode: 409, statusMessage: "already_exists" });
    if (/not authorized|rate limit|smtp|email/i.test(msg)) throw createError({ statusCode: 502, statusMessage: "email_failed" });
    throw createError({ statusCode: 500, statusMessage: "invite_failed" });
  }

  await writeAudit(event, staff, { action: "staff.invite", targetType: "counselors", targetId: data.user.id, reason: role });

  const { error: insertError } = await db.from("counselors").insert({
    counselor_id: data.user.id,
    name,
    role,
    status: "active",
  });
  if (insertError) {
    console.error("[staff.invite] counselors insert failed", insertError.code);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { counselorId: data.user.id };
});
