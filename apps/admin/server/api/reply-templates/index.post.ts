// 返信テンプレートの登録・変更（要件 7.15）。運営管理者のみ。
// templateId があれば変更、なければ新規登録。相談員の氏名を含めないこと（3.6.1）は画面で注意する
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<Record<string, unknown>>(event);
  const row = {
    title: requireText(body?.title, "title", 100),
    body: requireText(body?.body, "body", 5000),
    sort_order: optionalInt(body?.sortOrder, "sort_order", 0, 9999) ?? 0,
    active: body?.active !== false,
    updated_by: staff.userId,
    updated_at: new Date().toISOString(),
  };
  const db = serviceDb(event);
  const id = body?.templateId ? requireUuid(body.templateId, "template_id") : null;
  await writeAudit(event, staff, { action: id ? "template.update" : "template.create", targetType: "reply_templates", targetId: id, reason: row.title });
  const { error } = id ? await db.from("reply_templates").update(row).eq("template_id", id) : await db.from("reply_templates").insert(row);
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
