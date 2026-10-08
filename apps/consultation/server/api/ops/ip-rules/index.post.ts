// サイト全体の拒否リストへの追加（未決事項一覧 2.18）。運営管理者のみ。理由は必須で、監査ログに残す。
// 自分の接続元を含む値は登録できない（自分を締め出さないため）。
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { MAX_BLOCK_RULES, myIp, optionalNote, requireCidr } from "../../../ops/ipRules";
import { cidrContains, parseIp } from "../../../../utils/ipCidr";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<{ cidr?: unknown; note?: unknown; reason?: unknown }>(event);
  const cidr = requireCidr(body?.cidr);
  const note = optionalNote(body?.note);
  const reason = requireText(body?.reason, "reason", 500);
  const mine = myIp(event);
  const me = mine ? parseIp(mine) : null;
  if (me && cidrContains(cidr, me)) throw createError({ statusCode: 400, statusMessage: "self_block" });
  // 0.0.0.0/0 のような極端に広い範囲は、誤操作でサービスを止めるため受け付けない
  if ((cidr.v === 4 && cidr.prefix < 8) || (cidr.v === 6 && cidr.prefix < 16)) throw createError({ statusCode: 400, statusMessage: "range_too_wide" });

  const db = serviceDb(event);
  const { count, error: countError } = await db.from("ip_rules").select("rule_id", { count: "exact", head: true }).eq("kind", "block");
  if (countError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if ((count ?? 0) >= MAX_BLOCK_RULES) throw createError({ statusCode: 409, statusMessage: "too_many_rules" });

  await writeAudit(event, staff, { action: "ip_rule.block.add", targetType: "ip_rules", reason: `${reason}（${cidr.text}）`.slice(0, 2000) });
  const { error } = await db.from("ip_rules").insert({ kind: "block", cidr: cidr.text, note, created_by: staff.userId });
  if (error) {
    if (error.code === "23505") throw createError({ statusCode: 409, statusMessage: "already_registered" });
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  invalidateIpRules();
  return { ok: true };
});
