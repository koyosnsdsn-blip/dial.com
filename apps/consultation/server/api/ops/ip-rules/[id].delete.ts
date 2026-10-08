// サイト全体の拒否リストからの削除（未決事項一覧 2.18）。運営管理者のみ。理由は必須。
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const ruleId = requireUuid(getRouterParam(event, "id"), "rule_id");
  const body = await readBody<{ reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);
  const db = serviceDb(event);
  const { data: cur, error } = await db.from("ip_rules").select("cidr").eq("rule_id", ruleId).eq("kind", "block").maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!cur) throw createError({ statusCode: 404, statusMessage: "not_found" });
  await writeAudit(event, staff, { action: "ip_rule.block.delete", targetType: "ip_rules", targetId: ruleId, reason: `${reason}（${cur.cidr}）`.slice(0, 2000) });
  const { error: delError } = await db.from("ip_rules").delete().eq("rule_id", ruleId);
  if (delError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  invalidateIpRules();
  return { ok: true };
});
