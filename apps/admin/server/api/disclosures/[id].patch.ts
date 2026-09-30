// 開示請求の進行（要件 7.13.2）。運営管理者のみ。
//   verify   … 本人確認が済んだことを記録する（済むまで、開示用データは出力できない）
//   complete … 本人への回答が済んだことを記録する
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "request_id");
  const body = await readBody<{ action?: unknown; note?: unknown }>(event);
  if (body?.action !== "verify" && body?.action !== "complete") throw createError({ statusCode: 400, statusMessage: "invalid_action" });
  const note = requireText(body?.note, "note", 1000);
  const db = serviceDb(event);
  const { data: cur } = await db.from("disclosure_requests").select("verified_at, completed_at, note").eq("request_id", id).maybeSingle();
  if (!cur) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (cur.completed_at) throw createError({ statusCode: 409, statusMessage: "already_completed" });
  if (body.action === "complete" && !cur.verified_at) throw createError({ statusCode: 409, statusMessage: "not_verified" });

  await writeAudit(event, staff, { action: `disclosure.${body.action}`, targetType: "disclosure_requests", targetId: id, reason: note });
  const now = new Date().toISOString();
  const patch = body.action === "verify" ? { verified_at: cur.verified_at ?? now } : { completed_at: now, completed_by: staff.userId };
  const { error } = await db.from("disclosure_requests").update({ ...patch, note: [cur.note, note].filter(Boolean).join("\n") }).eq("request_id", id);
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
