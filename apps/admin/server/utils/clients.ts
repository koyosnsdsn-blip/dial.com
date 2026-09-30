// 契約クライアント管理（要件 7.10）の共通処理
import { randomBytes } from "node:crypto";

// 返信SLA・ラリー回数は自由入力にせず、プリセットから選ぶ（要件 3.2.4・3.2.5）
export const SLA_PRESETS = [48, 24, 12, 8];
export const RALLY_PRESETS = [1, 2, 3, 4, 5];

// 体制側の承認を要する設定か（24時間未満のSLA、4回以上のラリー。要件 3.2.4・3.2.5）
export function needsCapacityApproval(rallyMax: number, slaHours: number): boolean {
  return slaHours < 24 || rallyMax >= 4;
}

// 標準プラン（フル／相談のみ／動画のみ）に当たるか。これ以外の組み合わせは例外として承認を要する（要件 3.10.7）
export function isStandardPlan(f: { qa: boolean; consult: boolean; video: boolean }): boolean {
  return (f.qa && f.consult && f.video) || (!f.qa && f.consult && !f.video) || (!f.qa && !f.consult && f.video);
}

// 招待コード：推測困難なランダム文字列。名称に由来する文字列は使わない（要件 7.10.8・8.6.2）。
// 見間違えやすい文字（0 O 1 l I）を除いた英数字20文字（約117ビット）
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function generateInviteCode(): string {
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < 20) {
    for (const b of randomBytes(32)) {
      if (b < limit && out.length < 20) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function optionalDate(value: unknown, name: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw createError({ statusCode: 400, statusMessage: `invalid_${name}` });
  }
  return value;
}
export function optionalInt(value: unknown, name: string, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw createError({ statusCode: 400, statusMessage: `invalid_${name}` });
  return n;
}
// 想定利用率（0〜100 の百分率で受け取り、0〜1 の割合で保存する）
export function optionalRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw createError({ statusCode: 400, statusMessage: "invalid_usage_rate" });
  return Math.round(n * 100) / 10000;
}
