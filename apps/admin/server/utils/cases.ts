// 案件操作の共通処理
import type { H3Event } from "h3";
import type { StaffContext } from "./auth";

export type VisibleCase = {
  case_id: string;
  account_id: string;
  counselor_id: string | null;
  status: "open" | "closed";
  urgent_flag: boolean;
};

// 本人の権限（RLS）で案件が見えることを確認する。見えなければ 404（存在の有無を区別させない）。
// service role で更新・記録する前に必ず呼ぶこと。
export async function requireVisibleCase(event: H3Event, caseId: string): Promise<VisibleCase> {
  const { data, error } = await (await userDb(event))
    .from("cases")
    .select("case_id, account_id, counselor_id, status, urgent_flag")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data) throw createError({ statusCode: 404, statusMessage: "not_found" });
  return data as VisibleCase;
}

// 担当相談員または運営管理者だけが操作できる（返信・往復調整・完了）
export function requireCaseOperator(staff: StaffContext, c: VisibleCase) {
  if (staff.role !== "admin" && c.counselor_id !== staff.userId) {
    throw createError({ statusCode: 403, statusMessage: "not_assignee" });
  }
}

export type CaseLimits = { rallyMax: number; slaHours: number; source: "payment" | "client" };

// 案件ごとの上限値（利用権付与時点の複写＋調整）。entitlements / rally_adjustments はブラウザに
// 権限を与えていないため service role で読む。呼ぶ前に対象案件の閲覧権限を確認済みであること。
export async function caseLimits(event: H3Event, caseIds: string[]): Promise<Map<string, CaseLimits>> {
  const result = new Map<string, CaseLimits>();
  if (caseIds.length === 0) return result;
  const db = serviceDb(event);

  const { data: rows, error } = await db
    .from("cases")
    .select("case_id, entitlement:entitlements(rally_max, sla_hours, source)")
    .in("case_id", caseIds);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const { data: adjustments, error: adjError } = await db
    .from("rally_adjustments")
    .select("case_id, delta")
    .in("case_id", caseIds);
  if (adjError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const deltaByCase = new Map<string, number>();
  for (const a of adjustments ?? []) {
    deltaByCase.set(a.case_id, (deltaByCase.get(a.case_id) ?? 0) + (a.delta as number));
  }
  for (const r of rows ?? []) {
    const e: any = (r as any).entitlement;
    result.set(r.case_id, {
      rallyMax: (e?.rally_max ?? 0) + (deltaByCase.get(r.case_id) ?? 0),
      slaHours: e?.sla_hours ?? 24,
      source: e?.source ?? "payment",
    });
  }
  return result;
}

// DB関数の例外（raise exception 'xxx'）を HTTP エラーに変換する
export function rpcError(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? "";
  const known: Record<string, number> = {
    not_found: 404,
    case_closed: 409,
    empty_body: 400,
    invalid_delta: 400,
    reason_required: 400,
    below_used: 409,
  };
  for (const [key, status] of Object.entries(known)) {
    if (msg.includes(key)) throw createError({ statusCode: status, statusMessage: key });
  }
  console.error("[rpc] failed", error?.code);
  throw createError({ statusCode: 500, statusMessage: "update_failed" });
}

// 理由・本文など文字列入力の検査
export function requireText(value: unknown, name: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0 || text.length > max) {
    throw createError({ statusCode: 400, statusMessage: `${name}_required` });
  }
  return text;
}
