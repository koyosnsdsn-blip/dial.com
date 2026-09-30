// 返信テンプレートの一覧（要件 7.15）。相談員・運営管理者。相談員には有効なものだけを返す
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  let q = serviceDb(event).from("reply_templates").select("template_id, title, body, sort_order, active, updated_at").order("sort_order").order("title");
  if (staff.role !== "admin") q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (data ?? []).map((t: any) => ({
    templateId: t.template_id as string,
    title: t.title as string,
    body: t.body as string,
    sortOrder: t.sort_order as number,
    active: t.active as boolean,
    updatedAt: t.updated_at as string,
  }));
});
