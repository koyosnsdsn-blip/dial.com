// 先生の登録（運営画面 /ops/experts）。運営管理者のみ。未決事項 2.19
// 相談員の招待（staff/index.post.ts）と同じ作り：Auth には x-… の識別子で登録し、本物のメールアドレスは experts.contact_email に持つ。
// 【暫定】メールは送らず、パスワード設定用のリンクを画面に返す（server/ops/setupLink.ts）。2段階認証は初回ログイン時に登録する。
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
import { parseProfile, requireGenreIds } from "../../../ops/experts";
import { loginIdToEmail } from "../../../ops/nickname";
import { SETUP_LINK_NOTE, createInviteLink } from "../../../ops/setupLink";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<Record<string, unknown>>(event);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw createError({ statusCode: 400, statusMessage: "invalid_email" });
  const profile = parseProfile(body);
  const genreIds = await requireGenreIds(event, body?.genreIds);

  const db = serviceDb(event);
  const loginEmail = loginIdToEmail("expert", email, useRuntimeConfig(event).public.nicknameDomain as string);
  const { userId, link } = await createInviteLink(event, loginEmail, "expert.invite");

  await writeAudit(event, staff, { action: "expert.invite", targetType: "experts", targetId: userId, reason: `${profile.qualification}／担当ジャンル ${genreIds.length}件` });

  const { error: insertError } = await db.from("experts").insert({
    expert_id: userId,
    display_name: profile.displayName,
    qualification: profile.qualification,
    affiliation: profile.affiliation,
    bio: profile.bio,
    status: "active",
    contact_email: email,
  });
  if (insertError) {
    console.error("[expert.invite] experts insert failed", insertError.code);
    // 先生として使えないAuthユーザーを残さない
    await db.auth.admin.deleteUser(userId).catch(() => {});
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  const { error: genreError } = await db.from("expert_genres").insert(genreIds.map((genre_id) => ({ expert_id: userId, genre_id })));
  if (genreError) {
    console.error("[expert.invite] expert_genres insert failed", genreError.code);
    await db.from("experts").delete().eq("expert_id", userId);
    await db.auth.admin.deleteUser(userId).catch(() => {});
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { expertId: userId, link, note: SETUP_LINK_NOTE };
});
