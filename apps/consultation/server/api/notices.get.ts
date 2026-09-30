// 利用者向けのお知らせ（要件 7.14.2）。掲載期間内で、本人が対象に含まれるものだけを返す。
//   all＝全利用者／member＝企業会員のみ／client＝特定のクライアントの所属者／personal＝個人利用者のみ
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const now = new Date().toISOString();
  const { data, error } = await serviceDb(event)
    .from("notices")
    .select("notice_id, body, target, client_id, display_from, display_to")
    .or(`display_from.is.null,display_from.lte.${now}`)
    .or(`display_to.is.null,display_to.gte.${now}`)
    .limit(50);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const member = Boolean(account.clientId) && account.tier === "member";
  return (data ?? [])
    .filter((n: any) =>
      n.target === "all" ? true : n.target === "member" ? member : n.target === "personal" ? !member : n.target === "client" ? member && n.client_id === account.clientId : false,
    )
    .map((n: any) => ({ noticeId: n.notice_id as string, body: n.body as string }));
});
