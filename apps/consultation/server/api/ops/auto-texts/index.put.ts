import { AUTO_TEXT_DEFAULTS, AUTO_TEXT_LABELS } from "../../../../ops/autoTexts";
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
// 自動文面の上書き・上書きの取り消し（要件 7.14.3）。運営管理者のみ。理由は必須。
// - 受付の自動応答には、差込項目 {返信までの時間} が必須。「24時間以内」のような固定の時間は書けない
//   （クライアントごとに返信SLAが違うため、文面と設定が食い違うのを防ぐ）
// - body が空なら、上書きを取り消して既定の文面に戻す
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<{ key?: unknown; clientId?: unknown; body?: unknown; reason?: unknown }>(event);
  const key = typeof body?.key === "string" && body.key in AUTO_TEXT_DEFAULTS ? body.key : null;
  if (!key) throw createError({ statusCode: 400, statusMessage: "invalid_key" });
  const clientId = body?.clientId ? requireUuid(body.clientId, "client_id") : null;
  const reason = requireText(body?.reason, "reason", 500);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (text.length > 500) throw createError({ statusCode: 400, statusMessage: "auto_text_too_long" });
  if (text) {
    for (const v of AUTO_TEXT_LABELS[key]?.vars ?? []) {
      if (!text.includes(`{${v}}`)) throw createError({ statusCode: 400, statusMessage: "auto_text_var_missing" });
    }
    if (key === "accepted" && /[0-9０-９]+\s*(時間|分|日)/.test(text)) throw createError({ statusCode: 400, statusMessage: "auto_text_fixed_time" });
  }
  const db = serviceDb(event);
  let find = db.from("auto_texts").select("body").eq("text_key", key);
  find = clientId ? find.eq("client_id", clientId) : find.is("client_id", null);
  const { data: cur } = await find.maybeSingle();

  await writeAudit(event, staff, {
    action: "auto_text.update",
    targetType: "auto_texts",
    targetId: clientId,
    reason: `${reason}（${key}${clientId ? "・クライアント別" : "・全体"}。変更前：${cur?.body ?? "既定の文面"}）`.slice(0, 2000),
  });
  let del = db.from("auto_texts").delete().eq("text_key", key);
  del = clientId ? del.eq("client_id", clientId) : del.is("client_id", null);
  const { error: delError } = await del;
  if (delError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  if (text) {
    const { error } = await db.from("auto_texts").insert({ text_key: key, client_id: clientId, body: text, updated_by: staff.userId });
    if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { ok: true };
});
