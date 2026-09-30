// 開示用データの出力（要件 7.13.2・7.9.1）。運営管理者のみ。本人確認が済んだ請求に限る。
// 相談内容の本文を含むため、監査ログの重点監視の対象。出力の前に必ず記録する
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "request_id");
  const { data: req } = await serviceDb(event).from("disclosure_requests").select("account_id, verified_at").eq("request_id", id).maybeSingle();
  if (!req) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (!req.verified_at) throw createError({ statusCode: 409, statusMessage: "not_verified" });
  await writeAudit(event, staff, { action: "disclosure.export", targetType: "accounts", targetId: req.account_id, reason: `開示請求 ${id}` });
  setHeader(event, "Cache-Control", "no-store");
  return await buildDisclosure(event, req.account_id);
});
