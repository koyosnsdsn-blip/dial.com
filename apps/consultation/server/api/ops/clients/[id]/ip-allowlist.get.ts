// クライアント管理サイトのIP許可リスト（要件 8.8.3。未決事項一覧 2.18）。運営管理者のみ。
import { requireStaff } from "../../../../ops/auth";
import { serviceDb } from "../../../../ops/db";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const { data, error } = await serviceDb(event).from("ip_rules").select("cidr, note, created_at").eq("kind", "client_admin_allow").eq("client_id", clientId).order("created_at");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  setHeader(event, "Cache-Control", "no-store");
  return { items: (data ?? []).map((r: any) => ({ cidr: String(r.cidr), note: r.note })) };
});
