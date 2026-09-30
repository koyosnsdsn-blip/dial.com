// お知らせの一覧（要件 7.14.2）。運営管理者のみ。
export default defineEventHandler(async (event) => {
  await requireStaff(event, { adminOnly: true });
  const { data, error } = await serviceDb(event).from("notices").select("notice_id, body, target, client_id, display_from, display_to").order("display_from", { ascending: false, nullsFirst: true }).limit(200);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (data ?? []).map((n: any) => ({
    noticeId: n.notice_id as string,
    body: n.body as string,
    target: n.target as "all" | "member" | "client" | "personal",
    clientId: n.client_id as string | null,
    displayFrom: n.display_from as string | null,
    displayTo: n.display_to as string | null,
  }));
});
