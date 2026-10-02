// 機能3（動画）の管理（要件 7.7）
import type { H3Event } from "h3";
import { requireText } from "./cases";
import { serviceDb } from "./db";
import { requireUuid } from "../utils/validate";

export const SCOPE_PERSONAL: Record<string, string> = { free: "無料会員以上", paid: "月額会員のみ", none: "対象外" };
export const SCOPE_BUSINESS: Record<string, string> = { all: "全クライアント", some: "選択したクライアントのみ", none: "対象外" };

// 埋め込み用のアドレスとして保存できるか。【仮】Vimeo・YouTube の埋め込み用アドレスのみ（配信サービスは未決：未決事項 No.59）
export function normalizeEmbedUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw createError({ statusCode: 400, statusMessage: "invalid_source" });
  try {
    const u = new URL(value.trim());
    const ok =
      u.protocol === "https:" &&
      ((u.hostname === "player.vimeo.com" && u.pathname.startsWith("/video/")) ||
        ((u.hostname === "www.youtube.com" || u.hostname === "www.youtube-nocookie.com") && u.pathname.startsWith("/embed/")));
    if (!ok) throw new Error("host");
    return u.toString();
  } catch {
    throw createError({ statusCode: 400, statusMessage: "invalid_source" });
  }
}

export type VideoInput = {
  title: string;
  description: string | null;
  category: string | null;
  source_ref: string | null;
  duration_sec: number | null;
  scope_personal: "free" | "paid" | "none";
  scope_business: "all" | "some" | "none";
  sort_order: number;
  clientIds: string[];
};

export function parseVideoInput(body: any): VideoInput {
  const title = requireText(body?.title, "title", 100);
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
  if (!(body?.scopePersonal in SCOPE_PERSONAL) || !(body?.scopeBusiness in SCOPE_BUSINESS)) throw createError({ statusCode: 400, statusMessage: "invalid_scope" });
  const minutes = body?.durationMin === "" || body?.durationMin === null || body?.durationMin === undefined ? null : Number(body.durationMin);
  if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 1000)) throw createError({ statusCode: 400, statusMessage: "invalid_value" });
  const clientIds = body.scopeBusiness === "some" && Array.isArray(body?.clientIds) ? [...new Set((body.clientIds as unknown[]).map((c) => requireUuid(c, "client_id")))] : [];
  if (body.scopeBusiness === "some" && clientIds.length === 0) throw createError({ statusCode: 400, statusMessage: "clients_required" });
  const sort = Number(body?.sortOrder ?? 0);
  return {
    title,
    description: text(body?.description, 2000),
    category: text(body?.category, 50),
    source_ref: normalizeEmbedUrl(body?.sourceRef),
    duration_sec: minutes === null ? null : Math.round(minutes * 60),
    scope_personal: body.scopePersonal,
    scope_business: body.scopeBusiness,
    sort_order: Number.isInteger(sort) && sort >= 0 && sort <= 9999 ? sort : 0,
    clientIds,
  };
}

// 公開の指定を検査して、保存する状態を返す。
//   公開・予約公開は、両方の軸が「対象外」ではできない。視聴できる利用者を確認したこと（confirmed）が条件（7.7.3）
export function publishState(body: any, input: VideoInput): { status: "draft" | "scheduled" | "published"; published_at: string | null } {
  const mode = body?.publish;
  if (mode !== "now" && mode !== "schedule") return { status: "draft", published_at: null };
  if (input.scope_personal === "none" && input.scope_business === "none") throw createError({ statusCode: 400, statusMessage: "scope_required" });
  if (!input.source_ref) throw createError({ statusCode: 400, statusMessage: "source_required" });
  if (body?.confirmed !== true) throw createError({ statusCode: 400, statusMessage: "audience_not_confirmed" });
  if (mode === "now") return { status: "published", published_at: new Date().toISOString() };
  const at = typeof body?.publishAt === "string" ? new Date(body.publishAt) : null;
  if (!at || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) throw createError({ statusCode: 400, statusMessage: "invalid_date" });
  return { status: "scheduled", published_at: at.toISOString() };
}

export async function saveVideoClients(event: H3Event, videoId: string, clientIds: string[]) {
  const db = serviceDb(event);
  const { error: delError } = await db.from("video_client_scopes").delete().eq("video_id", videoId);
  if (delError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  if (clientIds.length) {
    const { error } = await db.from("video_client_scopes").insert(clientIds.map((c) => ({ video_id: videoId, client_id: c })));
    if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
}

export function scopeSummary(v: { scope_personal: string; scope_business: string }, clients: string[]): string {
  return `個人：${SCOPE_PERSONAL[v.scope_personal]}／企業：${SCOPE_BUSINESS[v.scope_business]}${v.scope_business === "some" ? `（${clients.length}社）` : ""}`;
}
