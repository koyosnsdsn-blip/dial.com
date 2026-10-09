// ジャンルの削除（要件 7.15）。運営管理者のみ。記事があるジャンルは、移行先の指定が必須（記事を移してから消す）
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "genre");
  const moveTo = getQuery(event).moveTo;
  const db = serviceDb(event);
  const { count } = await db.from("questions").select("question_id", { count: "exact", head: true }).eq("genre_id", id);
  let target: string | null = null;
  if (count) {
    target = requireUuid(moveTo, "move_to");
    if (target === id) throw createError({ statusCode: 400, statusMessage: "invalid_move_to" });
    const { data: g } = await db.from("genres").select("genre_id").eq("genre_id", target).maybeSingle();
    if (!g) throw createError({ statusCode: 400, statusMessage: "invalid_move_to" });
  }
  await writeAudit(event, staff, { action: "genre.delete", targetType: "genres", targetId: id, reason: target ? `記事 ${count} 件を ${target} へ移行` : null });
  if (target) {
    const { error: moveError } = await db.from("questions").update({ genre_id: target }).eq("genre_id", id);
    if (moveError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  // 先生の担当ジャンルからも外す（外さないと、外部キーの制約でジャンルを消せない。未決事項 2.19）
  const { error: expertError } = await db.from("expert_genres").delete().eq("genre_id", id);
  if (expertError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  const { error } = await db.from("genres").delete().eq("genre_id", id);
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true, moved: count ?? 0 };
});
