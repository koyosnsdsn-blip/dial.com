// 動画の一覧（要件 7.7.1）。運営管理者のみ。配信範囲（2軸）・公開状態・視聴数を返す
export default defineEventHandler(async (event) => {
  await requireStaff(event, { adminOnly: true });
  const db = serviceDb(event);
  const [{ data, error }, { data: views, error: viewError }, { data: scopes, error: scopeError }] = await Promise.all([
    db.from("videos").select("video_id, title, category, duration_sec, scope_personal, scope_business, status, published_at, sort_order, updated_at").order("sort_order").order("created_at", { ascending: false }).limit(500),
    db.from("video_views").select("video_id").limit(100000),
    db.from("video_client_scopes").select("video_id, client_id"),
  ]);
  if (error || viewError || scopeError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const viewCount = new Map<string, number>();
  for (const v of views ?? []) viewCount.set(v.video_id, (viewCount.get(v.video_id) ?? 0) + 1);
  const clientCount = new Map<string, number>();
  for (const s of scopes ?? []) clientCount.set(s.video_id, (clientCount.get(s.video_id) ?? 0) + 1);
  return (data ?? []).map((v: any) => ({
    videoId: v.video_id as string,
    title: v.title as string,
    category: v.category as string | null,
    durationSec: v.duration_sec as number | null,
    scopePersonal: v.scope_personal as string,
    scopeBusiness: v.scope_business as string,
    clientCount: clientCount.get(v.video_id) ?? 0,
    status: v.status as "draft" | "scheduled" | "published",
    publishedAt: v.published_at as string | null,
    sortOrder: v.sort_order as number,
    views: viewCount.get(v.video_id) ?? 0,
  }));
});
