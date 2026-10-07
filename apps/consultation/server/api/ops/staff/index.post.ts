// 相談員・運営管理者の招待（要件 7.12.1 登録）。運営管理者のみ。
// Supabase Auth の招待メールを送り、本人が /accept-invite でパスワードを設定 → 2段階認証を登録する。
//
// 注意（dev）：Supabase 標準のメール送信は、Supabase の組織メンバーのアドレスにしか届かず、送信数の上限も小さい。
// 本番運用には独自のメール配信サービス（SMTP）の設定が必要（未決事項 No.59）。
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { SETUP_LINK_NOTE, createInviteLink } from "../../../ops/setupLink";
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
  // 【暫定】メールは送らず、パスワード設定用のリンクを作って画面に返す（server/ops/setupLink.ts）
  const { userId, link } = await createInviteLink(event, email, "staff.invite");

  await writeAudit(event, staff, { action: "staff.invite", targetType: "counselors", targetId: userId, reason: role });

  const { error: insertError } = await db.from("counselors").insert({
    counselor_id: userId,
    name,
    role,
    status: "active",
  });
  if (insertError) {
    console.error("[staff.invite] counselors insert failed", insertError.code);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { counselorId: userId, link, note: SETUP_LINK_NOTE };
});
