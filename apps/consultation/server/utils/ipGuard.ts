// IP制限の判定（未決事項一覧 2.18）。
//   - サイト全体の拒否リスト（kind = block）：server/middleware/ipBlock.ts が、すべての画面・APIの前で判定する
//   - クライアント管理サイトの許可リスト（kind = client_admin_allow）：server/ops/portal.ts の requireClientAdmin が判定する
//
// 接続元のIPは、Vercel が付ける x-real-ip（なければ x-forwarded-for の先頭）から取る。Vercel はこれらのヘッダーを
// 利用者から送られた値で上書きするため、偽装できない。Vercel 以外の環境に移すときは、この前提を見直すこと。
//
// 規則はインスタンスごとに30秒間キャッシュする（毎回DBを引かない）。変更の反映には最大30秒かかる。
import type { H3Event } from "h3";
import { cidrContains, parseCidr, parseIp, type ParsedCidr } from "../../utils/ipCidr";

type Rule = { kind: "block" | "client_admin_allow"; clientId: string | null; cidr: ParsedCidr };
const TTL_MS = 30_000;
let cache: { at: number; rules: Rule[] } | null = null;

export function requestIp(event: H3Event): string | null {
  const real = getHeader(event, "x-real-ip");
  if (real) return real.trim();
  const fwd = getHeader(event, "x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return event.node.req.socket?.remoteAddress ?? null;
}

export function invalidateIpRules() {
  cache = null;
}

async function loadIpRules(event: H3Event): Promise<Rule[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rules;
  const { data, error } = await serviceDb(event).from("ip_rules").select("kind, client_id, cidr");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const rules: Rule[] = [];
  for (const r of data ?? []) {
    const cidr = parseCidr(String(r.cidr));
    if (cidr) rules.push({ kind: r.kind, clientId: r.client_id, cidr });
  }
  cache = { at: Date.now(), rules };
  return rules;
}

// 拒否リストに該当するか。DBを読めないとき（障害・鍵の未設定）は、拒否しない（相談の受付を止めないため）
export async function ipBlocked(event: H3Event): Promise<boolean> {
  const raw = requestIp(event);
  const ip = raw ? parseIp(raw) : null;
  if (!ip) return false;
  let rules: Rule[];
  try {
    rules = await loadIpRules(event);
  } catch {
    return false;
  }
  return rules.some((r) => r.kind === "block" && cidrContains(r.cidr, ip));
}

// クライアント管理サイトの許可リスト。登録がなければ制限しない（8.8.3）。
// 登録があるのに接続元が分からないとき・DBを読めないときは、通さない（管理サイトは業務用のため、安全側に倒す）
export async function clientAdminIpAllowed(event: H3Event, clientId: string): Promise<{ allowed: boolean; ip: string | null }> {
  const raw = requestIp(event);
  const rules = (await loadIpRules(event)).filter((r) => r.kind === "client_admin_allow" && r.clientId === clientId);
  if (rules.length === 0) return { allowed: true, ip: raw };
  const ip = raw ? parseIp(raw) : null;
  if (!ip) return { allowed: false, ip: raw };
  return { allowed: rules.some((r) => cidrContains(r.cidr, ip)), ip: raw };
}
