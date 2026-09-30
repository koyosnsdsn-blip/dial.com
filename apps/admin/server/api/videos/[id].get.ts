// 動画の詳細（編集用。要件 7.7.2）。運営管理者のみ
export default defineEventHandler(async (event) => {
  await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "video_id");
  const db = serviceDb(event);
  const [{ data: v, error }, { data: scopes }, { count }] = await Promise.all([
    db.from("videos").select("video_id, title, description, category, source_ref, duration_sec, scope_personal, scope_business, status, published_at, sort_order").eq("video_id", id).maybeSingle(),
    db.from("video_client_scopes").select("client_id").eq("video_id", id),
    db.from("video_views").select("view_id", { count: "exact", head: true }).eq("video_id", id),
  ]);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!v) throw createError({ statusCode: 404, statusMessage: "not_found" });
  return {
    videoId: v.video_id as string,
    title: v.title as string,
    description: (v.description as string | null) ?? "",
    category: (v.category as string | null) ?? "",
    sourceRef: (v.source_ref as string | null) ?? "",
    durationMin: v.duration_sec === null ? "" : Math.round((v.duration_sec as number) / 60),
    scopePersonal: v.scope_personal as "free" | "paid" | "none",
    scopeBusiness: v.scope_business as "all" | "some" | "none",
    clientIds: (scopes ?? []).map((s: any) => s.client_id as string),
    status: v.status as "draft" | "scheduled" | "published",
    publishedAt: v.published_at as string | null,
    sortOrder: v.sort_order as number,
    views: count ?? 0,
  };
});
