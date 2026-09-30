// 動画の視聴（要件 4.3・4.4）。視聴権限を確認してから、埋め込み用のアドレスを返し、視聴ログを記録する。
// 視聴ログは、クライアントへ個人単位で開示しない（集計値のみ）。
// 【仮】署名付きURLの発行は、配信サービスが決まってから実装する（未決事項 No.59）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const f = await featuresOf(event, account);
  if (!f.video) throw createError({ statusCode: 404, statusMessage: "video_not_found" });
  const id = requireUuid(getRouterParam(event, "id"), "video_id");
  const v = (await visibleVideos(event, account)).find((x) => x.video_id === id);
  if (!v) throw createError({ statusCode: 404, statusMessage: "video_not_found" });

  const { error } = await serviceDb(event).from("video_views").insert({ video_id: id, account_id: account.userId });
  if (error) console.error("[video.view] failed to record", error.code);

  return {
    videoId: v.video_id,
    title: v.title,
    description: v.description,
    category: v.category,
    durationSec: v.duration_sec,
    publishedAt: v.published_at,
    embedUrl: safeEmbedUrl(v.source_ref),
  };
});
