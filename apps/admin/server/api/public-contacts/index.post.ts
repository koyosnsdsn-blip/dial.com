// 公的窓口の登録・変更（要件 7.15）。相談員チームが維持管理するため、相談員も操作できる。監査ログに記録する。
// 利用者の安全に直結する情報のため、電話番号・URLの形式を検査する。掲載内容の正しさは運用で確認すること
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const body = await readBody<Record<string, unknown>>(event);
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);
  const phone = text(body?.phone, 30);
  if (phone && !/^[0-9#*+\-() ]{2,30}$/.test(phone)) throw createError({ statusCode: 400, statusMessage: "invalid_phone" });
  const url = text(body?.url, 300);
  if (url && !/^https:\/\/[^\s]+$/.test(url)) throw createError({ statusCode: 400, statusMessage: "invalid_url" });
  const row = {
    name: requireText(body?.name, "name", 100),
    phone,
    hours: text(body?.hours, 100),
    note: text(body?.note, 300),
    url,
    sort_order: optionalInt(body?.sortOrder, "sort_order", 0, 9999) ?? 0,
    active: body?.active !== false,
    updated_at: new Date().toISOString(),
  };
  const db = serviceDb(event);
  const id = body?.contactId ? requireUuid(body.contactId, "contact_id") : null;
  await writeAudit(event, staff, { action: id ? "contact.update" : "contact.create", targetType: "public_contacts", targetId: id, reason: `${row.name}${row.active ? "" : "（非表示）"}` });
  const { error } = id ? await db.from("public_contacts").update(row).eq("contact_id", id) : await db.from("public_contacts").insert(row);
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
