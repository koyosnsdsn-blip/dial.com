// 問い合わせを対応済みにする／未対応に戻す（要件 10.5）。運営管理者のみ。対応の内容をメモに残す
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "inquiry_id");
  const body = await readBody<{ status?: unknown; note?: unknown }>(event);
  if (body?.status !== "open" && body?.status !== "done") throw createError({ statusCode: 400, statusMessage: "invalid_status" });
  const note = body.status === "done" ? requireText(body?.note, "note", 1000) : null;
  await writeAudit(event, staff, { action: body.status === "done" ? "inquiry.done" : "inquiry.reopen", targetType: "inquiries", targetId: id });
  const { data, error } = await serviceDb(event)
    .from("inquiries")
    .update(body.status === "done" ? { status: "done", note, handled_by: staff.userId, handled_at: new Date().toISOString() } : { status: "open", handled_by: null, handled_at: null })
    .eq("inquiry_id", id)
    .select("inquiry_id");
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  if (!data?.length) throw createError({ statusCode: 404, statusMessage: "not_found" });
  return { ok: true };
});
