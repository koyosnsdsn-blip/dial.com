// 先生（弁護士・社労士・メンタル相談の先生など）のサーバーAPIの認可。/api/ops/expert/… の冒頭で必ず requireExpert() を呼ぶこと。
// 先生は運営画面（/ops）の中に入口があるが、相談員・運営管理者とは別のアカウント・別の表（experts）で、通れる範囲も別（未決事項 2.19）。
//
// 検査すること（どれか1つでも欠けたら拒否）：
//   - Supabase Auth のセッションがある（運営画面用のCookie sb-ops-auth-token）
//   - MFA を通過している（aal2）
//   - ログインから8時間以内
//   - ログインID（Auth 上のメールアドレス）が、先生用の識別子（x-…）である
//   - experts に本人の行があり、status = 'active'（読むのは本人の権限＋RLS。他人の行は読めない）
//
// requireStaff() は s-… 以外を拒否するので、先生は既存の運営API（案件・相談員の管理など）には入れない。
import type { H3Event } from "h3";
import { areaClaims, areaSupabaseClient } from "./session";
import { STAFF_SESSION_SECONDS, lastAuthAt } from "../../ops/session";
import { roleOfLoginEmail } from "./nickname";

export type ExpertContext = {
  userId: string;
  name: string;
  qualification: string;
  affiliation: string | null;
};

export async function requireExpert(event: H3Event): Promise<ExpertContext> {
  let claims: Record<string, any> | null = null;
  try {
    claims = await areaClaims(event, "ops");
  } catch {
    claims = null;
  }
  if (!claims?.sub) throw createError({ statusCode: 401, statusMessage: "signed_out" });
  if (claims.aal !== "aal2") throw createError({ statusCode: 401, statusMessage: "mfa_required" });
  const authAt = lastAuthAt(claims);
  if (authAt === null || Date.now() / 1000 - authAt > STAFF_SESSION_SECONDS) {
    throw createError({ statusCode: 401, statusMessage: "signed_out" });
  }
  if (roleOfLoginEmail(claims.email, useRuntimeConfig(event).public.nicknameDomain as string) !== "expert") {
    throw createError({ statusCode: 403, statusMessage: "not_expert" });
  }

  const { data, error } = await areaSupabaseClient(event, "ops")
    .from("experts")
    .select("expert_id, display_name, qualification, affiliation, status")
    .eq("expert_id", claims.sub)
    .maybeSingle();
  if (error || !data || data.status !== "active") {
    throw createError({ statusCode: 403, statusMessage: "not_expert" });
  }
  return { userId: data.expert_id, name: data.display_name, qualification: data.qualification, affiliation: data.affiliation };
}
