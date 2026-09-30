// ジャンルの改名・並べ替え（要件 7.15）。運営管理者のみ
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "genre");
  const body = await readBody<{ name?: unknown; sortOrder?: unknown }>(event);
  const patch: Record<string, unknown> = {};
  if (body?.name !== undefined) patch.name = requireText(body.name, "title", 50);
  if (body?.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 9999) throw createError({ statusCode: 400, statusMessage: "invalid_value" });
    patch.sort_order = n;
  }
  if (Object.keys(patch).length === 0) return { ok: true };
  await writeAudit(event, staff, { action: "genre.update", targetType: "genres", targetId: id, reason: Object.keys(patch).join(", ") });
  const { error } = await serviceDb(event).from("genres").update(patch).eq("genre_id", id);
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
