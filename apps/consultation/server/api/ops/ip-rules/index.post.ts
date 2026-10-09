// サイト全体の拒否リストへの追加（未決事項一覧 2.18）。運営管理者のみ。理由は必須で、監査ログに残す。
// 複数の値をまとめて登録できる（cidrs に最大50件。1件だけなら従来どおり cidr でもよい）。
//   ・1件でも形式が正しくない・広すぎる・自分の接続元を含む場合は、1件も登録しない
//   ・すでに登録済みの値は読み飛ばし、結果に載せる
// 自分の接続元を含む値は登録できない（自分を締め出さないため）。
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { MAX_BLOCK_RULES, MAX_BULK_RULES, myIp, optionalNote, requireCidr } from "../../../ops/ipRules";
import { cidrContains, parseIp, type ParsedCidr } from "../../../../utils/ipCidr";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<{ cidr?: unknown; cidrs?: unknown; note?: unknown; reason?: unknown }>(event);
  const raw: unknown[] = Array.isArray(body?.cidrs) ? body.cidrs : body?.cidr !== undefined ? [body.cidr] : [];
  if (raw.length === 0) throw createError({ statusCode: 400, statusMessage: "invalid_cidr" });
  if (raw.length > MAX_BULK_RULES) throw createError({ statusCode: 400, statusMessage: "too_many_items" });
  const note = optionalNote(body?.note);
  const reason = requireText(body?.reason, "reason", 500);

  // 形式の確認（同じ値は1件にまとめる）。1件でも誤りがあれば、何も登録しない
  const cidrs: ParsedCidr[] = [];
  for (const value of raw) {
    const c = requireCidr(value);
    if (!cidrs.some((x) => x.text === c.text)) cidrs.push(c);
  }
  const mine = myIp(event);
  const me = mine ? parseIp(mine) : null;
  for (const cidr of cidrs) {
    if (me && cidrContains(cidr, me)) throw createError({ statusCode: 400, statusMessage: "self_block" });
    // 0.0.0.0/0 のような極端に広い範囲は、誤操作でサービスを止めるため受け付けない
    if ((cidr.v === 4 && cidr.prefix < 8) || (cidr.v === 6 && cidr.prefix < 16)) throw createError({ statusCode: 400, statusMessage: "range_too_wide" });
  }

  const db = serviceDb(event);
  const { count, error: countError } = await db.from("ip_rules").select("rule_id", { count: "exact", head: true }).eq("kind", "block");
  if (countError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if ((count ?? 0) + cidrs.length > MAX_BLOCK_RULES) throw createError({ statusCode: 409, statusMessage: "too_many_rules" });

  await writeAudit(event, staff, {
    action: "ip_rule.block.add",
    targetType: "ip_rules",
    reason: `${reason}（${cidrs.length}件：${cidrs.map((c) => c.text).join("、")}）`.slice(0, 2000),
  });

  const added: string[] = [];
  const skipped: string[] = [];
  let failed = false;
  for (const cidr of cidrs) {
    const { error } = await db.from("ip_rules").insert({ kind: "block", cidr: cidr.text, note, created_by: staff.userId });
    if (!error) added.push(cidr.text);
    else if (error.code === "23505") skipped.push(cidr.text);
    else {
      failed = true;
      break;
    }
  }
  if (added.length > 0) invalidateIpRules();
  if (failed) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  if (added.length === 0) throw createError({ statusCode: 409, statusMessage: "already_registered" });
  return { ok: true, added, skipped };
});
