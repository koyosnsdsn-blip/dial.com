// 通報への対応（要件 7.11.3）。記事ごとに、修正／非公開化／通報却下のいずれかを選ぶ。理由の記録は必須。
//   修正     … 記事を直したうえで選ぶ（記事の編集は公開済み記事の管理画面で行う）。自動で一時非公開になっていた場合は再公開する
//   非公開化 … 記事を非公開にする
//   通報却下 … 記事はそのまま。自動で一時非公開になっていた場合は再公開する
// 通報者への結果の通知は行わない
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const body = await readBody<{ resolution?: unknown; note?: unknown }>(event);
  if (body?.resolution !== "fixed" && body?.resolution !== "hidden" && body?.resolution !== "dismissed") throw createError({ statusCode: 400, statusMessage: "invalid_resolution" });
  const note = requireText(body?.note, "reason", 500);
  const db = serviceDb(event);
  const { data: q } = await db.from("questions").select("question_id, unpublished_at, unpublish_reason, status").eq("question_id", id).maybeSingle();
  if (!q || q.status !== "published") throw createError({ statusCode: 404, statusMessage: "qa_not_found" });

  await writeAudit(event, staff, { action: `qa.report.${body.resolution}`, targetType: "questions", targetId: id, reason: note });
  const now = new Date().toISOString();
  if (body.resolution === "hidden") {
    const { error } = await db.from("questions").update({ unpublished_at: q.unpublished_at ?? now, unpublish_reason: note }).eq("question_id", id);
    if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  } else if (q.unpublished_at && q.unpublish_reason === "auto_report") {
    const { error } = await db.from("questions").update({ unpublished_at: null, unpublish_reason: null }).eq("question_id", id);
    if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  const { error: repError } = await db.from("reports").update({ resolution: body.resolution, resolved_at: now, resolved_by: staff.userId, resolution_note: note }).eq("question_id", id).is("resolution", null);
  if (repError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
