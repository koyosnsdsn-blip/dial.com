// ランディングページの入稿内容（要件 7.8・8.6.2）。運営管理者のみ
export default defineEventHandler(async (event) => {
  await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const db = serviceDb(event);
  const [{ data: client, error }, { data: lp }] = await Promise.all([
    db.from("clients").select("name, status, contract_type, feature_consult, sla_hours").eq("client_id", clientId).maybeSingle(),
    db.from("landing_pages").select("comment_text, contact_text, accent_color, published_at, client_code, updated_at").eq("client_id", clientId).maybeSingle(),
  ]);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!client) throw createError({ statusCode: 404, statusMessage: "not_found" });
  return {
    clientName: client.name as string,
    clientStatus: client.status as "prep" | "active" | "closed",
    contractType: client.contract_type as "corp" | "muni",
    featureConsult: Boolean(client.feature_consult),
    slaHours: client.sla_hours as number,
    comment: (lp?.comment_text as string | null) ?? "",
    contact: (lp?.contact_text as string | null) ?? "",
    accent: (lp?.accent_color as string | null) ?? "teal",
    published: Boolean(lp?.published_at),
    clientCode: (lp?.client_code as string | null) ?? null,
    updatedAt: (lp?.updated_at as string | null) ?? null,
  };
});
