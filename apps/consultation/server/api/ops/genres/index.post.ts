// ジャンルの追加（要件 7.15）。運営管理者のみ
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<{ name?: unknown }>(event);
  const name = requireText(body?.name, "title", 50);
  const db = serviceDb(event);
  const { data: last } = await db.from("genres").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  await writeAudit(event, staff, { action: "genre.create", targetType: "genres", reason: name });
  const { data, error } = await db.from("genres").insert({ name, sort_order: ((last?.[0]?.sort_order as number | undefined) ?? 0) + 1 }).select("genre_id").single();
  if (error || !data) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { genreId: data.genre_id as string };
});
