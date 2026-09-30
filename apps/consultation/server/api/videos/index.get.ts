// 動画の一覧（要件 4.2・4.3）。自分が視聴できる動画だけを返す。配信範囲そのものは返さない
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const f = await featuresOf(event, account);
  if (!f.video) throw createError({ statusCode: 404, statusMessage: "video_not_found" });
  const rows = await visibleVideos(event, account);
  return {
    items: rows.map((v) => ({
      videoId: v.video_id,
      title: v.title,
      description: v.description,
      category: v.category,
      durationSec: v.duration_sec,
      publishedAt: v.published_at,
    })),
  };
});
