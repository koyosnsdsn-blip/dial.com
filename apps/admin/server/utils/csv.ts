// CSV 出力（要件 7.9）の共通処理
import type { H3Event } from "h3";

// 1回の出力の上限（超える場合は期間を分けてもらう）
export const EXPORT_MAX_ROWS = 5000;

// 出力の対象期間（利用権の付与日＝案件の開始日。日本時間の日付）。両方必須、最長366日
export function exportRange(event: H3Event): { from: string; to: string; fromTs: string; toTs: string } {
  const q = getQuery(event);
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const from = typeof q.from === "string" && day.test(q.from) ? q.from : "";
  const to = typeof q.to === "string" && day.test(q.to) ? q.to : "";
  if (!from || !to || from > to) throw createError({ statusCode: 400, statusMessage: "invalid_date" });
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (!Number.isFinite(days) || days > 366) throw createError({ statusCode: 400, statusMessage: "range_too_long" });
  return { from, to, fromTs: `${from}T00:00:00+09:00`, toTs: `${to}T23:59:59.999+09:00` };
}

// セルの値を CSV 用に整える。
// 先頭が = + - @ の値は、表計算ソフトで数式として実行されないよう、先頭に ' を付ける（CSVインジェクション対策）
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(cell).join(","));
  // Excel で文字化けしないよう、先頭に BOM を付ける
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function sendCsv(event: H3Event, filename: string, csv: string): string {
  setHeader(event, "Content-Type", "text/csv; charset=utf-8");
  setHeader(event, "Content-Disposition", `attachment; filename="${filename}"`);
  setHeader(event, "Cache-Control", "no-store");
  return csv;
}

const jst = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
// 日時を日本時間の「YYYY-MM-DD HH:MM:SS」にする
export function jstDateTime(iso: string | null | undefined): string {
  return iso ? jst.format(new Date(iso)) : "";
}
