// 管理側サーバーAPIの認可。相談内容系のAPIは必ず冒頭で requireStaff() を呼ぶこと。
//
// 検査すること（どれか1つでも欠けたら拒否）：
//   - Supabase Auth のセッションがある（Cookie）
//   - そのセッションが MFA を通過している（JWT の aal が aal2）… 要件 8.8.2
//   - counselors に本人の行があり、status = 'active' … 要件 7.12.1（発行・失効は管理者が行う）
//   - adminOnly 指定時は role = 'admin'
//
// counselors の参照には利用者本人の権限（publishable key＋本人のJWT）を使い、service role キーは使わない。
// RLS（counselors_select_self_or_admin）により本人の行しか読めないため、ここで他人の情報を誤って返すことはない。
import type { H3Event } from "h3";
import { serverSupabaseClient, serverSupabaseUser } from "#supabase/server";
import { STAFF_SESSION_SECONDS, lastAuthAt } from "../../ops/session";

export type StaffContext = {
  userId: string;
  name: string;
  role: "admin" | "counselor";
};

export async function requireStaff(
  event: H3Event,
  options: { adminOnly?: boolean } = {},
): Promise<StaffContext> {
  let claims: Record<string, any> | null = null;
  try {
    claims = (await serverSupabaseUser(event)) as Record<string, any> | null;
  } catch {
    claims = null;
  }

  if (!claims?.sub) {
    throw createError({ statusCode: 401, statusMessage: "signed_out" });
  }
  if (claims.aal !== "aal2") {
    throw createError({ statusCode: 401, statusMessage: "mfa_required" });
  }
  // 運営側のログインは8時間で打ち切る（ops/session.ts を参照。1つのホストにまとめたため、Cookie の有効期限だけでは区別できない）
  const authAt = lastAuthAt(claims);
  if (authAt === null || Date.now() / 1000 - authAt > STAFF_SESSION_SECONDS) {
    throw createError({ statusCode: 401, statusMessage: "signed_out" });
  }

  const client = await serverSupabaseClient(event);
  const { data, error } = await client
    .from("counselors")
    .select("counselor_id, name, role, status")
    .eq("counselor_id", claims.sub)
    .maybeSingle();

  if (error || !data || data.status !== "active") {
    throw createError({ statusCode: 403, statusMessage: "not_staff" });
  }
  if (options.adminOnly && data.role !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "admin_only" });
  }

  return { userId: data.counselor_id, name: data.name, role: data.role };
}
