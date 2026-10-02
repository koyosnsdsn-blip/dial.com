// メールテンプレートの編集（要件 7.14.1）。運営管理者のみ。理由は必須。版を1つ進め、変更前の文面を監査ログに残す。
// 件名・本文に、相談の内容を示す語を入れないこと（10.2.1）。本文には、メッセージの内容を差し込む項目を用意していない
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "template_id");
  const body = await readBody<{ subject?: unknown; body?: unknown; reason?: unknown }>(event);
  const subject = requireText(body?.subject, "subject", 100);
  const text = requireText(body?.body, "body", 3000);
  const reason = requireText(body?.reason, "reason", 500);
  const db = serviceDb(event);
  const { data: cur } = await db.from("mail_templates").select("subject, body, version, template_key").eq("template_id", id).maybeSingle();
  if (!cur) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (cur.subject === subject && cur.body === text) return { ok: true, unchanged: true };

  await writeAudit(event, staff, {
    action: "mail_template.update",
    targetType: "mail_templates",
    targetId: id,
    reason: `${reason}（${cur.template_key} 第${cur.version}版→第${cur.version + 1}版。変更前の件名：${cur.subject}／変更前の本文：${cur.body}）`.slice(0, 4000),
  });
  const { error } = await db.from("mail_templates").update({ subject, body: text, version: cur.version + 1, updated_at: new Date().toISOString() }).eq("template_id", id);
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
