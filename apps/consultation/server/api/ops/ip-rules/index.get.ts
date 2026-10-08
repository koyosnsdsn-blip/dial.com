// サイト全体の拒否リストの一覧（未決事項一覧 2.18）。運営管理者のみ。
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
import { myIp } from "../../../ops/ipRules";
export default defineEventHandler(async (event) => {
  await requireStaff(event, { adminOnly: true });
  const { data, error } = await serviceDb(event)
    .from("ip_rules")
    .select("rule_id, cidr, note, created_at, counselors(name)")
    .eq("kind", "block")
    .order("created_at", { ascending: false });
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  setHeader(event, "Cache-Control", "no-store");
  return {
    myIp: myIp(event),
    rules: (data ?? []).map((r: any) => ({ ruleId: r.rule_id, cidr: String(r.cidr), note: r.note, createdAt: r.created_at, createdBy: r.counselors?.name ?? null })),
  };
});
