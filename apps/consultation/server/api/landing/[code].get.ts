// クライアント別ランディングページ（要件 8.6.2）。ログイン前の公開ページ用。
//   - クライアントコードは URL にだけ使う。認証には使わない（所属の確認は招待コードで行う）
//   - 公開済みで、クライアントが有効なときだけ返す。それ以外は 404（画面側で共通の入口へ転送する）
//   - 返すのは、表示に使う項目だけ。招待コードやクライアントIDは返さない
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, "code") ?? "";
  if (!/^[A-Za-z0-9]{12,40}$/.test(code)) throw createError({ statusCode: 404, statusMessage: "landing_not_found" });
  const db = serviceDb(event);
  const { data, error } = await db
    .from("landing_pages")
    .select("comment_text, contact_text, accent_color, published_at, client:clients(name, status, contract_type, feature_qa, feature_consult, feature_video, sla_hours)")
    .eq("client_code", code)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const client = (data as any)?.client;
  if (!data || !data.published_at || !client || client.status !== "active") {
    throw createError({ statusCode: 404, statusMessage: "landing_not_found" });
  }
  setHeader(event, "X-Robots-Tag", "noindex, nofollow");
  return {
    clientName: client.name as string,
    contractType: client.contract_type as "corp" | "muni",
    comment: (data.comment_text as string | null) ?? "",
    contact: (data.contact_text as string | null) ?? "",
    accent: (data.accent_color as string | null) ?? "teal",
    featureQa: Boolean(client.feature_qa),
    featureConsult: Boolean(client.feature_consult),
    featureVideo: Boolean(client.feature_video),
    slaHours: client.sla_hours as number,
  };
});
