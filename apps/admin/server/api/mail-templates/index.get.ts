// メールテンプレートの一覧（要件 7.14.1）。運営管理者のみ
export default defineEventHandler(async (event) => {
  await requireStaff(event, { adminOnly: true });
  const { data, error } = await serviceDb(event).from("mail_templates").select("template_id, template_key, subject, body, version, updated_at").order("template_key");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (data ?? []).map((t: any) => ({ templateId: t.template_id as string, key: t.template_key as string, subject: t.subject as string, body: t.body as string, version: t.version as number, updatedAt: t.updated_at as string }));
});
