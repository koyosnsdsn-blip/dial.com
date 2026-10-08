// IPアドレス・CIDR（例：203.0.113.0/24、2001:db8::/32）の解析と判定。サーバー・画面で共通。
// IPv4 を IPv6 の形で表した値（::ffff:203.0.113.5）は IPv4 として扱う。

export type ParsedIp = { v: 4 | 6; bytes: number[] };
export type ParsedCidr = ParsedIp & { prefix: number; text: string };

function parseV4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function parseV6(s: string): number[] | null {
  if (!/^[0-9a-fA-F:.]+$/.test(s) || s.split("::").length > 2) return null;
  // 末尾に IPv4 の表記がある形（::ffff:1.2.3.4）
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  if (s.includes(".")) {
    const v4 = parseV4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    s = s.slice(0, lastColon + 1) + "0:0";
  }
  const [head, rest] = s.split("::") as [string, string | undefined];
  const toGroups = (x: string) => (x === "" ? [] : x.split(":"));
  const h = toGroups(head);
  const r = rest === undefined ? [] : toGroups(rest);
  const missing = 8 - h.length - r.length;
  if (rest === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [...h, ...Array(rest === undefined ? 0 : missing).fill("0"), ...r];
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    out.push(n >> 8, n & 0xff);
  }
  if (tail.length) out.splice(12, 4, ...tail);
  return out;
}

export function parseIp(input: string): ParsedIp | null {
  const s = input.trim().replace(/^\[|\]$/g, "").split("%")[0];
  const v4 = parseV4(s);
  if (v4) return { v: 4, bytes: v4 };
  const v6 = parseV6(s);
  if (!v6) return null;
  // ::ffff:a.b.c.d は IPv4
  if (v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff) return { v: 4, bytes: v6.slice(12) };
  return { v: 6, bytes: v6 };
}

function format(ip: ParsedIp): string {
  if (ip.v === 4) return ip.bytes.join(".");
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((ip.bytes[i] << 8) | ip.bytes[i + 1]).toString(16));
  return groups.join(":");
}

// 「203.0.113.5」のようにアドレスだけなら /32（IPv6 は /128）として扱う。
// ホスト部が0でない値（192.168.1.1/24）は、ネットワークのアドレス（192.168.1.0/24）に直さずに誤りとする（意図の取り違えを防ぐ）
export function parseCidr(input: string): ParsedCidr | null {
  const [addr, len, extra] = input.trim().split("/");
  if (extra !== undefined || !addr) return null;
  const ip = parseIp(addr);
  if (!ip) return null;
  const max = ip.v === 4 ? 32 : 128;
  if (len !== undefined && !/^\d{1,3}$/.test(len)) return null;
  const prefix = len === undefined ? max : Number(len);
  if (prefix > max) return null;
  for (let bit = prefix; bit < max; bit++) {
    if (ip.bytes[bit >> 3] & (0x80 >> (bit & 7))) return null;
  }
  return { ...ip, prefix, text: `${format(ip)}/${prefix}` };
}

export function cidrContains(cidr: ParsedCidr, ip: ParsedIp): boolean {
  if (cidr.v !== ip.v) return false;
  const full = cidr.prefix >> 3;
  for (let i = 0; i < full; i++) if (cidr.bytes[i] !== ip.bytes[i]) return false;
  const rem = cidr.prefix & 7;
  if (rem === 0) return true;
  const mask = (0xff << (8 - rem)) & 0xff;
  return (cidr.bytes[full] & mask) === (ip.bytes[full] & mask);
}
