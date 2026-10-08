// 運営画面からのIP制限の設定で共通の処理（未決事項一覧 2.18）
import type { H3Event } from "h3";
import { parseCidr, type ParsedCidr } from "../../utils/ipCidr";

export const MAX_BLOCK_RULES = 500;
export const MAX_ALLOW_RULES = 50;

export function requireCidr(value: unknown): ParsedCidr {
  const c = typeof value === "string" ? parseCidr(value) : null;
  if (!c) throw createError({ statusCode: 400, statusMessage: "invalid_cidr" });
  return c;
}

export function optionalNote(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 200) throw createError({ statusCode: 400, statusMessage: "invalid_note" });
  return value.trim() || null;
}

export function myIp(event: H3Event): string | null {
  return requestIp(event);
}
