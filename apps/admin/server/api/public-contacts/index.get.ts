// 公的窓口の一覧（要件 3.5・7.15）。相談員・運営管理者。緊急時の案内ページに表示する内容
export default defineEventHandler(async (event) => {
  await requireStaff(event);
  const { data, error } = await serviceDb(event).from("public_contacts").select("*").order("sort_order").order("name");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (data ?? []).map((c: any) => ({
    contactId: c.contact_id as string,
    name: c.name as string,
    phone: c.phone as string | null,
    hours: c.hours as string | null,
    note: c.note as string | null,
    url: c.url as string | null,
    sortOrder: c.sort_order as number,
    active: c.active as boolean,
  }));
});
