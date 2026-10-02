// お知らせの登録・変更・取り下げ（要件 7.14.2）。運営管理者のみ。利用者側の画面上部に表示する。
//   対象：all＝全利用者／member＝企業会員のみ／client＝特定のクライアントの所属者／personal＝個人利用者のみ
//   掲載期間は日本時間の日付で指定する（開始日の0時〜終了日の24時）。取り下げは action = "delete"
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { optionalDate } from "../../../ops/clients";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<Record<string, unknown>>(event);
  const db = serviceDb(event);
  const id = body?.noticeId ? requireUuid(body.noticeId, "notice_id") : null;

  if (body?.action === "delete") {
    if (!id) throw createError({ statusCode: 400, statusMessage: "invalid_notice_id" });
    await writeAudit(event, staff, { action: "notice.delete", targetType: "notices", targetId: id });
    const { error } = await db.from("notices").delete().eq("notice_id", id);
    if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    return { ok: true };
  }

  const target = body?.target;
  if (target !== "all" && target !== "member" && target !== "client" && target !== "personal") throw createError({ statusCode: 400, statusMessage: "invalid_target" });
  const clientId = target === "client" ? requireUuid(body?.clientId, "client") : null;
  const from = optionalDate(body?.displayFrom, "date");
  const to = optionalDate(body?.displayTo, "date");
  if (from && to && from > to) throw createError({ statusCode: 400, statusMessage: "invalid_date" });
  const row = {
    body: requireText(body?.body, "body", 1000),
    target,
    client_id: clientId,
    display_from: from ? `${from}T00:00:00+09:00` : null,
    display_to: to ? `${to}T23:59:59+09:00` : null,
  };
  await writeAudit(event, staff, { action: id ? "notice.update" : "notice.create", targetType: "notices", targetId: id, reason: `対象 ${target}` });
  const { error } = id ? await db.from("notices").update(row).eq("notice_id", id) : await db.from("notices").insert(row);
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
