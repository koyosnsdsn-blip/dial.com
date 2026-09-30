// 機能1（Q&A）の共通処理（管理側）
//
// 守ること：
//   - 投稿者のアカウントID（questions.account_id）を、通常の画面には返さない（要件 2.6）。
//     相談員に見せるのは、使い捨ての表示IDと「同じ投稿者から直近30日で◯件目」のバッジだけ
//   - 投稿履歴の例外開示は、運営管理者が理由を入力したときだけ行い、監査ログに残す
import type { H3Event } from "h3";

export const REJECT_CODES: Record<string, string> = {
  B: "対応範囲外（医療上の診断、法律上の判断、第三者への攻撃など）",
  E: "質問として成立しない／匿名化の修正では対応できない（書き直しを案内）",
  F: "公開に適さないが、個別対応が適切（相談と公的窓口を案内）",
};
export const DISCARD_CODES: Record<string, string> = {
  G1: "ふざけ、意味をなさない文字列",
  G2: "誹謗中傷、差別的表現",
  G3: "同一趣旨の連投",
  G4: "広告、勧誘",
};
export const REPORT_REASONS: Record<string, string> = {
  identifiable: "個人が特定され得る記述",
  inappropriate: "不適切な内容",
  incorrect: "誤った情報",
  other: "その他",
};

// 投稿からの経過営業日数。【仮】土日だけを除く（祝日・年末年始は未対応。SLA は3営業日：要件 6.1）
export function businessDaysSince(iso: string, now = new Date()): number {
  const day = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(d);
  const start = new Date(`${day(new Date(iso))}T00:00:00+09:00`);
  const end = new Date(`${day(now)}T00:00:00+09:00`);
  let n = 0;
  for (let t = start.getTime() + 86400000; t <= end.getTime(); t += 86400000) {
    const w = new Date(t + 9 * 3600000).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

// ID の一覧を、絞り込みに渡せる大きさに分ける（アドレスが長くなりすぎないように）
export function chunks<T>(items: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function qaRpcError(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? "";
  const known: Record<string, number> = {
    not_pending: 409,
    invalid_merge_target: 400,
    invalid_code: 400,
    reason_required: 400,
    empty_body: 400,
    body_too_long: 400,
    not_found: 404,
  };
  for (const [key, status] of Object.entries(known)) {
    if (msg.includes(key)) throw createError({ statusCode: status, statusMessage: key === "not_found" ? "qa_not_found" : key === "empty_body" ? "answer_required" : key === "body_too_long" ? "qa_too_long" : key });
  }
  console.error("[qa rpc] failed", error?.code, msg);
  throw createError({ statusCode: 500, statusMessage: "update_failed" });
}

export async function genreNames(event: H3Event): Promise<Map<string, string>> {
  const { data, error } = await serviceDb(event).from("genres").select("genre_id, name");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return new Map((data ?? []).map((g: any) => [g.genre_id as string, g.name as string]));
}

// 同じ投稿者の、直近30日の投稿数（バッジ用）。アカウントIDそのものは返さない
export async function recentPostCounts(event: H3Event, accountIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  for (const part of chunks(ids)) {
    const { data, error } = await serviceDb(event).from("questions").select("account_id").in("account_id", part).gte("posted_at", since).limit(5000);
    if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const r of data ?? []) out.set(r.account_id, (out.get(r.account_id) ?? 0) + 1);
  }
  return out;
}
