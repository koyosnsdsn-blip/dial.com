// クライアント管理サイト（要件 7.6）のサーバー側の共通処理。
//
// CLAUDE.md 制約#3：クライアント管理者（client_admins）も Supabase Auth を使う。ただし、
// 相談内容系テーブル（cases / messages など）へのアクセス経路は一切持たせず、
// 事前集計済みの四半期レポート（client_quarterly_reports）だけを、RLS を通して読ませる。
// このため /api/portal/ 以下では、cases・messages などを service role でも読まないこと。
import type { H3Event } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverSupabaseClient, serverSupabaseUser } from "#supabase/server";
import { STAFF_SESSION_SECONDS, lastAuthAt } from "../../ops/session";
import { serviceDb } from "./db";
import { createInviteLink, createResetLink } from "./setupLink";

export type ClientAdminContext = { userId: string; clientId: string; name: string };

// 検査すること：ログイン済み／多要素認証を通過（aal2）／client_admins に有効な本人の行がある
// client_admins は本人の権限で読む（RLS：本人の行しか読めない）
export async function requireClientAdmin(event: H3Event): Promise<ClientAdminContext> {
  let claims: Record<string, any> | null = null;
  try {
    claims = (await serverSupabaseUser(event)) as Record<string, any> | null;
  } catch {
    claims = null;
  }
  if (!claims?.sub) throw createError({ statusCode: 401, statusMessage: "signed_out" });
  if (claims.aal !== "aal2") throw createError({ statusCode: 401, statusMessage: "mfa_required" });
  // 運営側のログインは8時間で打ち切る（ops/session.ts を参照。1つのホストにまとめたため、Cookie の有効期限だけでは区別できない）
  const authAt = lastAuthAt(claims);
  if (authAt === null || Date.now() / 1000 - authAt > STAFF_SESSION_SECONDS) {
    throw createError({ statusCode: 401, statusMessage: "signed_out" });
  }

  const client = (await serverSupabaseClient(event)) as unknown as SupabaseClient;
  const { data, error } = await client
    .from("client_admins")
    .select("admin_id, client_id, name, status")
    .eq("admin_id", claims.sub)
    .maybeSingle();
  if (error || !data || data.status !== "active") throw createError({ statusCode: 403, statusMessage: "not_client_admin" });
  return { userId: data.admin_id, clientId: data.client_id, name: data.name };
}

export async function writePortalAudit(
  event: H3Event,
  actor: ClientAdminContext,
  entry: { action: string; targetType: string; targetId?: string | null; reason?: string | null },
): Promise<void> {
  const { error } = await serviceDb(event).from("audit_logs").insert({
    actor_type: "client_admin",
    actor_id: actor.userId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId ?? null,
    reason: entry.reason ?? null,
  });
  if (error) {
    console.error("[audit] failed to write audit log", { action: entry.action, code: error.code });
    throw createError({ statusCode: 500, statusMessage: "audit_log_failed" });
  }
}

export function requireEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw createError({ statusCode: 400, statusMessage: "invalid_email" });
  }
  return email;
}

// クライアント管理者を招待する（パスワード設定用のリンク → /ops/accept-invite でパスワード設定 → 2段階認証の登録）。
// 【暫定】メールは送らず、リンクを呼び出し側へ返して画面に表示する（server/ops/setupLink.ts）。
// すでに Auth に登録のあるメールアドレス（相談員・利用者など）は招待できない（役割ごとにアカウントを分ける）。
// 呼び出し側で、権限の確認と監査ログの記録を先に済ませること。
export async function inviteClientAdmin(event: H3Event, clientId: string, email: string, name: string): Promise<{ adminId: string; link: string }> {
  const db = serviceDb(event);
  const { userId, link } = await createInviteLink(event, email, "client_admin.invite");
  const { error: insertError } = await db.from("client_admins").insert({ admin_id: userId, client_id: clientId, name, email, status: "active" });
  if (insertError) {
    console.error("[client_admin.invite] insert failed", insertError.code);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { adminId: userId, link };
}

// クライアント管理者に、パスワードを設定し直すリンクを作る。対象が指定のクライアントの有効な管理者であることを確かめる
export async function clientAdminResetLink(event: H3Event, clientId: string, adminId: string): Promise<string> {
  const { data, error } = await serviceDb(event).from("client_admins").select("admin_id, status").eq("admin_id", adminId).eq("client_id", clientId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (data.status !== "active") throw createError({ statusCode: 409, statusMessage: "expired_account" });
  return createResetLink(event, adminId, "client_admin.reset");
}

// クライアント管理者の失効・再有効化。有効な管理者が1人もいなくなる変更は、DBのトリガが拒否する。
export async function setClientAdminStatus(event: H3Event, clientId: string, adminId: string, status: "active" | "expired"): Promise<void> {
  const db = serviceDb(event);
  const { data, error } = await db.from("client_admins").update({ status }).eq("admin_id", adminId).eq("client_id", clientId).select("admin_id");
  if (error) {
    if (/at least one active client_admin/.test(error.message ?? "")) throw createError({ statusCode: 409, statusMessage: "last_client_admin" });
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  if (!data?.length) throw createError({ statusCode: 404, statusMessage: "not_found" });
  // 失効：ログインを停止する。再有効化：停止を解除する
  await db.auth.admin.updateUserById(adminId, { ban_duration: status === "expired" ? "876000h" : "none" });
}

export type ReportRow = {
  quarterStart: string;
  members: number;
  employeeCount: number | null;
  casesTotal: number | null;
  genres: { label: string; count: number }[] | null;
  slaRate: number | null;
  videoViews: number | null;
  generatedAt: string;
};
export function toReportRow(r: any): ReportRow {
  return {
    quarterStart: r.quarter_start,
    members: r.members,
    employeeCount: r.employee_count,
    casesTotal: r.cases_total,
    genres: r.genres,
    slaRate: r.sla_rate,
    videoViews: r.video_views ?? null,
    generatedAt: r.generated_at,
  };
}
export const REPORT_COLUMNS = "quarter_start, members, employee_count, cases_total, genres, sla_rate, video_views, generated_at";
