// 先生の変更（運営画面 /ops/experts）。運営管理者のみ。理由は必須で、監査ログに記録する。未決事項 2.19
// 変更できるもの：表示名・資格・所属・紹介文、担当ジャンル、状態（active / suspended）
//   ・停止（suspended）にするとログインも止める。公開済みのコメントは残る（出所を残すため）。再開で解除
//   ・担当ジャンルを外しても、公開済みのコメントはそのまま残る（新しくコメントできなくなるだけ）
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { parseProfile, requireGenreIds } from "../../../ops/experts";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const expertId = requireUuid(getRouterParam(event, "id"), "expert_id");
  const body = await readBody<Record<string, unknown>>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const db = serviceDb(event);
  const { data: target, error } = await db.from("experts").select("expert_id, status").eq("expert_id", expertId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!target) throw createError({ statusCode: 404, statusMessage: "not_found" });

  const changed: string[] = [];
  const patch: Record<string, unknown> = {};
  if (body.displayName !== undefined || body.qualification !== undefined || body.affiliation !== undefined || body.bio !== undefined) {
    const p = parseProfile(body);
    Object.assign(patch, { display_name: p.displayName, qualification: p.qualification, affiliation: p.affiliation, bio: p.bio });
    changed.push("profile");
  }
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "suspended") throw createError({ statusCode: 400, statusMessage: "invalid_status" });
    if (body.status !== target.status) {
      patch.status = body.status;
      changed.push("status");
    }
  }
  let genreIds: string[] | null = null;
  if (body.genreIds !== undefined) {
    genreIds = await requireGenreIds(event, body.genreIds);
    changed.push("genres");
  }
  if (changed.length === 0) return { ok: true, unchanged: true };

  await writeAudit(event, staff, { action: "expert.update", targetType: "experts", targetId: expertId, reason: `${reason}（変更：${changed.join(", ")}）` });

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await db.from("experts").update(patch).eq("expert_id", expertId);
    if (updateError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  if (genreIds) {
    // 入れ替え：外れたものを消し、増えたものを足す
    const { data: current } = await db.from("expert_genres").select("genre_id").eq("expert_id", expertId);
    const have = new Set((current ?? []).map((g: any) => g.genre_id as string));
    const remove = [...have].filter((g) => !genreIds!.includes(g));
    const add = genreIds.filter((g) => !have.has(g));
    if (add.length > 0) {
      const { error: addError } = await db.from("expert_genres").insert(add.map((genre_id) => ({ expert_id: expertId, genre_id })));
      if (addError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    }
    if (remove.length > 0) {
      const { error: delError } = await db.from("expert_genres").delete().eq("expert_id", expertId).in("genre_id", remove);
      if (delError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    }
  }
  if ("status" in patch) {
    await db.auth.admin.updateUserById(expertId, { ban_duration: patch.status === "suspended" ? "876000h" : "none" });
  }
  return { ok: true };
});
