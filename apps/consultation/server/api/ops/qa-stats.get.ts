// Q&A の処理状況（要件 6.4.8・7.5）。直近90日。
// 処理の種類別・区分別の件数、匿名化修正の発生率、マージ件数、相談員別の破棄率、ジャンル別の投稿数
import { requireStaff } from "../../ops/auth";
import { serviceDb } from "../../ops/db";
import { genreNames } from "../../ops/qa";
export default defineEventHandler(async (event) => {
  await requireStaff(event);
  const db = serviceDb(event);
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [{ data: actions, error }, { data: posts, error: postError }, names, { data: staffRows }] = await Promise.all([
    db.from("question_actions").select("action, reason_code, counselor_id").gte("acted_at", since).limit(20000),
    db.from("questions").select("genre_id").eq("operator_created", false).gte("posted_at", since).limit(20000),
    genreNames(event),
    db.from("counselors").select("counselor_id, name"),
  ]);
  if (error || postError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const byAction: Record<string, number> = { publish: 0, reject: 0, discard: 0, merge: 0, anonymize: 0 };
  const byCode: Record<string, number> = {};
  const perStaff = new Map<string, { handled: number; discarded: number }>();
  for (const a of actions ?? []) {
    byAction[a.action] = (byAction[a.action] ?? 0) + 1;
    if (a.reason_code) byCode[a.reason_code] = (byCode[a.reason_code] ?? 0) + 1;
    if (a.counselor_id && a.action !== "anonymize") {
      const s = perStaff.get(a.counselor_id) ?? { handled: 0, discarded: 0 };
      s.handled++;
      if (a.action === "discard") s.discarded++;
      perStaff.set(a.counselor_id, s);
    }
  }
  const staffNames = new Map((staffRows ?? []).map((s: any) => [s.counselor_id as string, s.name as string]));
  const byGenre = new Map<string, number>();
  for (const p of posts ?? []) byGenre.set(p.genre_id ?? "", (byGenre.get(p.genre_id ?? "") ?? 0) + 1);
  const handled = byAction.publish + byAction.reject + byAction.discard + byAction.merge;
  return {
    days: 90,
    handled,
    byAction,
    byCode,
    anonymizeRate: byAction.publish ? Math.round((byAction.anonymize / byAction.publish) * 100) : null,
    staff: [...perStaff].map(([id, s]) => ({ name: staffNames.get(id) ?? "（不明）", handled: s.handled, discarded: s.discarded, discardRate: s.handled ? Math.round((s.discarded / s.handled) * 100) : 0 })).sort((a, b) => b.handled - a.handled),
    genres: [...byGenre].map(([id, n]) => ({ name: names.get(id) ?? "（未分類）", posts: n })).sort((a, b) => b.posts - a.posts),
  };
});
