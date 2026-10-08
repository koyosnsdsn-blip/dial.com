// クライアント管理サイトのIP許可リストの変更（要件 8.8.3。未決事項一覧 2.18）。運営管理者のみ。理由は必須。
// 一覧ごと置き換える。空にすると制限なし（未設定）に戻る。
// 先に追加してから削除する（途中で失敗しても、制限が消えた状態にならないように）。
import { writeAudit } from "../../../../ops/audit";
import { requireStaff } from "../../../../ops/auth";
import { requireText } from "../../../../ops/cases";
import { serviceDb } from "../../../../ops/db";
import { MAX_ALLOW_RULES, optionalNote, requireCidr } from "../../../../ops/ipRules";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const body = await readBody<{ items?: unknown; reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);
  if (!Array.isArray(body?.items) || body.items.length > MAX_ALLOW_RULES) throw createError({ statusCode: 400, statusMessage: "too_many_rules" });
  const wanted = new Map<string, string | null>();
  for (const it of body.items as any[]) {
    const c = requireCidr(it?.cidr);
    wanted.set(c.text, optionalNote(it?.note));
  }

  const db = serviceDb(event);
  const { data: client, error: clientError } = await db.from("clients").select("client_id").eq("client_id", clientId).maybeSingle();
  if (clientError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!client) throw createError({ statusCode: 404, statusMessage: "not_found" });
  const { data: cur, error } = await db.from("ip_rules").select("rule_id, cidr").eq("kind", "client_admin_allow").eq("client_id", clientId);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  // DB が返す表記（cidr 型の正規形）と比べるため、こちらでも同じ解析を通す
  const existing = new Map<string, string>();
  for (const r of cur ?? []) existing.set(requireCidr(String(r.cidr)).text, r.rule_id);
  const toAdd = [...wanted.keys()].filter((k) => !existing.has(k));
  const toDelete = [...existing.entries()].filter(([k]) => !wanted.has(k)).map(([, id]) => id);
  if (toAdd.length === 0 && toDelete.length === 0) return { ok: true, unchanged: true };

  const before = [...existing.keys()].join(", ") || "なし";
  const after = [...wanted.keys()].join(", ") || "なし（制限しない）";
  await writeAudit(event, staff, { action: "client.ip_allowlist.update", targetType: "clients", targetId: clientId, reason: `${reason}（${before} → ${after}）`.slice(0, 2000) });

  if (toAdd.length) {
    const { error: insError } = await db
      .from("ip_rules")
      .insert(toAdd.map((cidr) => ({ kind: "client_admin_allow", client_id: clientId, cidr, note: wanted.get(cidr) ?? null, created_by: staff.userId })));
    if (insError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  if (toDelete.length) {
    const { error: delError } = await db.from("ip_rules").delete().in("rule_id", toDelete);
    if (delError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  invalidateIpRules();
  return { ok: true };
});
