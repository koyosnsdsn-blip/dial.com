// 相談員・運営管理者の変更（要件 7.12.1）。運営管理者のみ。理由は必須で、監査ログに記録する。
// 変更できるもの：権限区分（admin / counselor）、状態（active / expired）、不在期間
//
// 守ること：
//   - 自分自身の権限・状態は変更できない（誤操作で誰も管理できなくなることを防ぐ）
//   - 有効な運営管理者を最低1人残す
//   - 担当中（対応中）の案件がある相談員を失効させる場合は、引継ぎ先の指定を必須とし、案件を付け替える（7.12.1）
//   - 失効したアカウントは Supabase Auth 側でもログインを停止する（再有効化で解除）
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const targetId = requireUuid(getRouterParam(event, "id"), "counselor_id");
  const body = await readBody<{
    role?: unknown;
    status?: unknown;
    absentFrom?: unknown;
    absentTo?: unknown;
    handoverTo?: unknown;
    reason?: unknown;
  }>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const db = serviceDb(event);
  const { data: target, error } = await db
    .from("counselors")
    .select("counselor_id, role, status, absent_from, absent_to")
    .eq("counselor_id", targetId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!target) throw createError({ statusCode: 404, statusMessage: "not_found" });

  const patch: Record<string, unknown> = {};
  if (body.role !== undefined) {
    if (body.role !== "admin" && body.role !== "counselor") throw createError({ statusCode: 400, statusMessage: "invalid_role" });
    if (body.role !== target.role) patch.role = body.role;
  }
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "expired") throw createError({ statusCode: 400, statusMessage: "invalid_status" });
    if (body.status !== target.status) patch.status = body.status;
  }
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (body.absentFrom !== undefined || body.absentTo !== undefined) {
    const from = body.absentFrom === null || body.absentFrom === "" ? null : body.absentFrom;
    const to = body.absentTo === null || body.absentTo === "" ? null : body.absentTo;
    if ((from !== null && (typeof from !== "string" || !date.test(from))) || (to !== null && (typeof to !== "string" || !date.test(to)))) {
      throw createError({ statusCode: 400, statusMessage: "invalid_date" });
    }
    if ((from === null) !== (to === null) || (from && to && from > to)) {
      throw createError({ statusCode: 400, statusMessage: "invalid_date" });
    }
    patch.absent_from = from;
    patch.absent_to = to;
  }
  if (Object.keys(patch).length === 0) return { ok: true, unchanged: true };

  if (targetId === staff.userId && ("role" in patch || "status" in patch)) {
    throw createError({ statusCode: 400, statusMessage: "cannot_change_self" });
  }

  const losesAdmin = target.role === "admin" && target.status === "active" && (patch.role === "counselor" || patch.status === "expired");
  if (losesAdmin) {
    const { count } = await db
      .from("counselors")
      .select("counselor_id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("status", "active")
      .neq("counselor_id", targetId);
    if (!count) throw createError({ statusCode: 409, statusMessage: "last_admin" });
  }

  let handoverTo: string | null = null;
  if (patch.status === "expired") {
    const { count: openCount } = await db
      .from("cases")
      .select("case_id", { count: "exact", head: true })
      .eq("counselor_id", targetId)
      .eq("status", "open");
    if (openCount) {
      handoverTo = requireUuid(body.handoverTo, "handover_to");
      if (handoverTo === targetId) throw createError({ statusCode: 400, statusMessage: "invalid_handover" });
      const { data: h } = await db.from("counselors").select("status").eq("counselor_id", handoverTo).maybeSingle();
      if (!h || h.status !== "active") throw createError({ statusCode: 400, statusMessage: "invalid_handover" });
    }
  }

  await writeAudit(event, staff, {
    action: "staff.update",
    targetType: "counselors",
    targetId,
    reason: `${reason}（変更：${Object.keys(patch).join(", ")}${handoverTo ? `、引継ぎ先 ${handoverTo}` : ""}）`,
  });

  if (handoverTo) {
    const { error: moveError } = await db.from("cases").update({ counselor_id: handoverTo }).eq("counselor_id", targetId).eq("status", "open");
    if (moveError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }

  const { error: updateError } = await db.from("counselors").update(patch).eq("counselor_id", targetId);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "update_failed" });

  if ("status" in patch) {
    // 失効：ログインを停止する（約100年）。再有効化：停止を解除する
    await db.auth.admin.updateUserById(targetId, { ban_duration: patch.status === "expired" ? "876000h" : "none" });
  }
  return { ok: true };
});
