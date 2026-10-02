// ジャンルの一覧（要件 7.15）。記事の件数を併せて返す
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
export default defineEventHandler(async (event) => {
  await requireStaff(event);
  const db = serviceDb(event);
  const [{ data, error }, { data: qs, error: qError }] = await Promise.all([
    db.from("genres").select("genre_id, name, sort_order").order("sort_order"),
    db.from("questions").select("genre_id").not("genre_id", "is", null).limit(50000),
  ]);
  if (error || qError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const n = new Map<string, number>();
  for (const q of qs ?? []) n.set(q.genre_id, (n.get(q.genre_id) ?? 0) + 1);
  return (data ?? []).map((g: any) => ({ genreId: g.genre_id as string, name: g.name as string, sortOrder: g.sort_order as number, questions: n.get(g.genre_id) ?? 0 }));
});
