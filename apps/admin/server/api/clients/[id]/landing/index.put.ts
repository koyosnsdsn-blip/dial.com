import { randomBytes } from "node:crypto";
// ランディングページの入稿・公開（要件 7.8・8.6.2）。運営管理者のみ。
// - 変えられるのは、掲載コメント・社内窓口の連絡先・アクセントカラー（候補から選ぶ）だけ。ロゴは未対応（画像の保管先が未決）
// - 掲載コメントは文字として表示する（HTML として解釈しない）
// - 入稿時の確認（開示範囲について事実と違う記載／利用を抑える記載／提供範囲を超える約束がないこと）を済ませていることが条件
// - クライアントコードは、推測できないランダムな文字列を自動で発行する。reissueCode で差し替えられる（流出時）
const ACCENTS = ["teal", "blue", "green", "purple", "brown", "navy"];
const code = () => randomBytes(18).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 20).padEnd(20, "x");

export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const body = await readBody<{ comment?: unknown; contact?: unknown; accent?: unknown; published?: unknown; checked?: unknown; reissueCode?: unknown; reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);
  const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
  const contact = typeof body?.contact === "string" ? body.contact.trim() : "";
  // 【仮】文字数の上限（未決事項 No.24）
  if (comment.length > 600 || contact.length > 300) throw createError({ statusCode: 400, statusMessage: "landing_too_long" });
  const accent = typeof body?.accent === "string" && ACCENTS.includes(body.accent) ? body.accent : "teal";
  if (body?.checked !== true) throw createError({ statusCode: 400, statusMessage: "checklist_not_confirmed" });

  const db = serviceDb(event);
  const [{ data: client }, { data: cur }] = await Promise.all([
    db.from("clients").select("status").eq("client_id", clientId).maybeSingle(),
    db.from("landing_pages").select("client_code, published_at, comment_text, contact_text, accent_color").eq("client_id", clientId).maybeSingle(),
  ]);
  if (!client) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (client.status === "closed") throw createError({ statusCode: 409, statusMessage: "client_closed" });

  const published = body?.published === true;
  const changed = [
    (cur?.comment_text ?? "") !== comment ? "掲載コメント" : "",
    (cur?.contact_text ?? "") !== contact ? "連絡先" : "",
    (cur?.accent_color ?? "teal") !== accent ? "色" : "",
    Boolean(cur?.published_at) !== published ? (published ? "公開" : "公開の停止") : "",
    body?.reissueCode === true && cur?.client_code ? "クライアントコードの再発行" : "",
  ].filter(Boolean);

  // URL に使うコードそのものは、監査ログに残さない
  await writeAudit(event, staff, { action: "landing.update", targetType: "landing_pages", targetId: clientId, reason: `${reason}（${changed.join("、") || "変更なし"}）`.slice(0, 2000) });
  const row = {
    client_id: clientId,
    comment_text: comment || null,
    contact_text: contact || null,
    accent_color: accent,
    published_at: published ? (cur?.published_at ?? new Date().toISOString()) : null,
    client_code: !cur?.client_code || body?.reissueCode === true ? code() : cur.client_code,
    updated_at: new Date().toISOString(),
    updated_by: staff.userId,
  };
  const { error } = await db.from("landing_pages").upsert(row, { onConflict: "client_id" });
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true, clientCode: row.client_code };
});
