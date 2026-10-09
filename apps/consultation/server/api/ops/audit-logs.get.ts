// 監査ログの閲覧（要件 7.16）。運営管理者のみ。閲覧のみで、編集・削除の機能は設けない（DBでも拒否される）。
// 絞り込み：実行者（actor）、操作種別（action の前方一致）、対象ID（target）、期間（from / to：YYYY-MM-DD、日本時間）
// 監査ログの閲覧自体も監査ログに記録する。
import { writeAudit } from "../../ops/audit";
import { requireStaff } from "../../ops/auth";
import { serviceDb, userDb } from "../../ops/db";
import { requireUuid } from "../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const q = getQuery(event);
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const page = Math.max(1, Math.min(1000, Number(q.page) || 1));
  const pageSize = 100;

  // 本人の権限で読む（RLS：aal2 の運営管理者のみ参照可）
  let request = (await userDb(event))
    .from("audit_logs")
    .select("log_id, actor_type, actor_id, action, target_type, target_id, reason, acted_at", { count: "exact" })
    .order("log_id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (typeof q.actor === "string" && q.actor) request = request.eq("actor_id", requireUuid(q.actor, "actor"));
  if (typeof q.target === "string" && q.target) request = request.eq("target_id", requireUuid(q.target, "target"));
  if (typeof q.action === "string" && /^[a-z._]{1,50}$/.test(q.action)) request = request.like("action", `${q.action}%`);
  if (typeof q.from === "string" && date.test(q.from)) request = request.gte("acted_at", `${q.from}T00:00:00+09:00`);
  if (typeof q.to === "string" && date.test(q.to)) request = request.lte("acted_at", `${q.to}T23:59:59.999+09:00`);

  const { data, error, count } = await request;
  if (error) {
    console.error("[audit.view] query failed", error.code);
    throw createError({ statusCode: 500, statusMessage: "query_failed" });
  }

  // 実行者の氏名（運営側の画面・監査ログでは表示してよい：要件 3.6.1）
  const actorIds = [...new Set((data ?? []).map((r: any) => r.actor_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: people } = await serviceDb(event).from("counselors").select("counselor_id, name").in("counselor_id", actorIds);
    for (const p of people ?? []) names.set(p.counselor_id, p.name);
    // 先生（experts）の操作は、表示名に「先生」を付けて区別する
    const { data: experts } = await serviceDb(event).from("experts").select("expert_id, display_name").in("expert_id", actorIds);
    for (const e of experts ?? []) names.set(e.expert_id, `${e.display_name} 先生`);
  }

  await writeAudit(event, staff, { action: "audit.view", targetType: "audit_logs" });

  return {
    total: count ?? 0,
    page,
    pageSize,
    items: (data ?? []).map((r: any) => ({
      logId: r.log_id as number,
      actedAt: r.acted_at as string,
      actorType: r.actor_type as string,
      actorId: r.actor_id as string | null,
      actorName: r.actor_id ? names.get(r.actor_id) ?? null : null,
      action: r.action as string,
      targetType: r.target_type as string,
      targetId: r.target_id as string | null,
      reason: r.reason as string | null,
    })),
  };
});
