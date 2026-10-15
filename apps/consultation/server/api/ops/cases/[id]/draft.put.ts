// 返信の下書きの保存（要件 7.3）。担当相談員または運営管理者。案件×相談員ごとに1件。
// 本文が空なら下書きを消す。下書きは相談内容に準じて扱い、保存の操作を監査ログに残す（CLAUDE.md 制約#1：更新のたびに記録し、記録できなければ保存しない）。
// 入力が止まるたびに自動保存されるため、1回の下書きで何十件も並ばないように、
// 「下書きの新規作成」と「10分以上あいた保存」だけを記録する（本文は記録しない）。消去は、下書きがあったときに記録する。
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireCaseOperator, requireVisibleCase } from "../../../../ops/cases";
import { serviceDb } from "../../../../ops/db";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const body = await readBody<{ body?: unknown }>(event);
  const text = typeof body?.body === "string" ? body.body : "";
  if (text.length > 5000) throw createError({ statusCode: 400, statusMessage: "body_required" });

  const c = await requireVisibleCase(event, caseId);
  requireCaseOperator(staff, c);
  if (c.status !== "open") throw createError({ statusCode: 409, statusMessage: "case_closed" });

  const db = serviceDb(event);
  const { data: existing, error: existingError } = await db.from("reply_drafts").select("updated_at").eq("case_id", caseId).eq("counselor_id", staff.userId).maybeSingle();
  if (existingError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (text.trim() === "") {
    if (existing) await writeAudit(event, staff, { action: "case.draft.clear", targetType: "cases", targetId: caseId });
    const { error } = await db.from("reply_drafts").delete().eq("case_id", caseId).eq("counselor_id", staff.userId);
    if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    return { saved: false };
  }
  const stale = !existing || Date.now() - new Date(existing.updated_at).getTime() > 10 * 60 * 1000;
  if (stale) await writeAudit(event, staff, { action: "case.draft.save", targetType: "cases", targetId: caseId });
  const { error } = await db
    .from("reply_drafts")
    .upsert({ case_id: caseId, counselor_id: staff.userId, body: text, updated_at: new Date().toISOString() }, { onConflict: "case_id,counselor_id" });
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { saved: true };
});
