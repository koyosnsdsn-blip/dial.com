// 案件操作の共通処理（相談者側）
import type { H3Event } from "h3";
import type { AccountContext } from "./auth";

export type OwnCase = {
  case_id: string;
  status: "open" | "closed";
  close_reason: "rally" | "expiry" | "idle" | "manual" | "user" | null;
  opened_at: string;
  closed_at: string | null;
  client_id: string | null;
  continuity: "same" | "changed" | null;
  idle_close_at: string | null;
  // 同時に対応中にできる枠。free＝無償の個人、main＝企業枠・有料の個人（枠ごとに対応中は1件まで）
  slot: "free" | "main";
};

// 本人の案件であることを確認する。本人の権限で、ビュー my_cases（本人の行・見せてよい列のみ）から読む。
// 担当者の識別子や往復の回数は、このビューに含まれない（要件 3.6.1・3.3.1）。
// 他人の案件・存在しない案件はどちらも 404 とし、存在の有無を区別させない。
export async function requireOwnCase(event: H3Event, account: AccountContext, caseId: string): Promise<OwnCase> {
  const { data, error } = await (await userDb(event))
    .from("my_cases")
    .select("case_id, status, close_reason, opened_at, closed_at, client_id, continuity, idle_close_at, slot")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data) throw createError({ statusCode: 404, statusMessage: "not_found" });
  return data as OwnCase;
}

// 対応中の相談と、新しい相談を始められるかどうか（画面の出し分けに使う。判定の正本は DB 関数 user_start_case）
// - 同時に対応中にできるのは枠ごとに1件まで。無償の個人の相談（free）が対応中でも、企業枠（main）の相談は始められる
// - 無償の個人（所属なし）は、何かが対応中のあいだは始められない
export type OpenCase = { caseId: string; free: boolean; openedAt: string };
export async function openCasesOf(event: H3Event): Promise<OpenCase[]> {
  const { data, error } = await (await userDb(event))
    .from("my_cases")
    .select("case_id, slot, opened_at")
    .eq("status", "open")
    .order("opened_at", { ascending: true });
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (data ?? []).map((r: any) => ({ caseId: r.case_id as string, free: r.slot === "free", openedAt: r.opened_at as string }));
}
export function canStartNew(m: { canConsult: boolean; personalFree: boolean }, open: OpenCase[]): boolean {
  if (!m.canConsult) return false;
  if (m.personalFree) return open.length === 0;
  return !open.some((c) => !c.free);
}

// DB関数の例外（raise exception 'xxx'）を HTTP エラーに変換する
export function rpcError(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? "";
  const known: Record<string, number> = {
    invalid_code: 400,
    not_eligible: 403,
    consent_required: 400,
    survey_incomplete: 400,
    case_already_open: 409,
    uq_cases_one_open_per_account: 409,
    not_found: 404,
    case_closed: 409,
    case_open: 409,
    empty_body: 400,
    body_too_long: 400,
  };
  for (const [key, status] of Object.entries(known)) {
    if (msg.includes(key)) {
      throw createError({ statusCode: status, statusMessage: key === "uq_cases_one_open_per_account" ? "case_already_open" : key });
    }
  }
  console.error("[rpc] failed", error?.code);
  throw createError({ statusCode: 500, statusMessage: "update_failed" });
}
