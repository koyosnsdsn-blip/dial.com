// 機能3（動画）の視聴権限（要件 4.2・4.3）。
//   個人利用者の軸：無料会員は「無料会員以上」の動画、月額会員は「無料会員以上」「月額会員のみ」の動画
//   企業会員の軸　：「全クライアント」の動画と、「選択したクライアントのみ」で自分の所属が選ばれている動画
// 未登録の利用者は常に対象外。公開中（status = published）の動画だけを対象にする
import type { H3Event } from "h3";
import type { AccountContext } from "./auth";

export type VideoRow = {
  video_id: string;
  title: string;
  description: string | null;
  category: string | null;
  source_ref: string | null;
  duration_sec: number | null;
  scope_personal: "free" | "paid" | "none";
  scope_business: "all" | "some" | "none";
  published_at: string | null;
  sort_order: number;
};

export async function visibleVideos(event: H3Event, account: AccountContext): Promise<VideoRow[]> {
  const db = serviceDb(event);
  const { data, error } = await db
    .from("videos")
    .select("video_id, title, description, category, source_ref, duration_sec, scope_personal, scope_business, published_at, sort_order")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false })
    .limit(500);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const rows = (data ?? []) as VideoRow[];

  if (account.tier === "member" && account.clientId) {
    const some = rows.filter((v) => v.scope_business === "some").map((v) => v.video_id);
    let allowed = new Set<string>();
    if (some.length) {
      const { data: scopes, error: scopeError } = await db.from("video_client_scopes").select("video_id").eq("client_id", account.clientId).in("video_id", some);
      if (scopeError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
      allowed = new Set((scopes ?? []).map((s: any) => s.video_id as string));
    }
    return rows.filter((v) => v.scope_business === "all" || (v.scope_business === "some" && allowed.has(v.video_id)));
  }
  return rows.filter((v) => v.scope_personal === "free" || (v.scope_personal === "paid" && account.tier === "paid"));
}

// 埋め込みに使えるアドレスか（【仮】Vimeo・YouTube の埋め込み用アドレスのみ。配信サービスは未決：未決事項 No.59）
export function safeEmbedUrl(ref: string | null): string | null {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    if (u.protocol !== "https:") return null;
    const ok =
      (u.hostname === "player.vimeo.com" && u.pathname.startsWith("/video/")) ||
      ((u.hostname === "www.youtube.com" || u.hostname === "www.youtube-nocookie.com") && u.pathname.startsWith("/embed/"));
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}
