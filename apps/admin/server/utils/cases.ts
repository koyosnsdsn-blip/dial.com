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

// 初回アンケートの緊急度で「すぐに話したい」が選ばれた案件は、一覧・詳細で強調する（要件 3.11.5）
// 【仮】判定は選択肢のラベルで行う（設問・選択肢が未確定のため：未決事項 No.38）
export const HURRY_ANSWER = "すぐに話したい";

// 短期間の再開・異常利用の判定に使う日数や件数は、サービス全体設定（server/utils/settings.ts）から読む

// 前回の終了から短期間で開始された案件か。支援の要否を判断するための情報であり、利用の抑止には使わない（3.4.2）。
// 同じ相談者の他の案件（担当外を含む）の終了日時が必要なため service role で読む。返すのは真偽値だけ。
// 呼ぶ前に、対象案件の閲覧権限を確認済みであること。
export async function quickRestartFlags(
  event: H3Event,
  rows: { case_id: string; account_id: string; opened_at: string }[],
  quickRestartDays: number,
): Promise<Set<string>> {
  const flagged = new Set<string>();
  const accountIds = [...new Set(rows.map((r) => r.account_id))];
  if (accountIds.length === 0) return flagged;
  const { data, error } = await serviceDb(event)
    .from("cases")
    .select("account_id, closed_at")
    .in("account_id", accountIds)
    .not("closed_at", "is", null);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const closedByAccount = new Map<string, number[]>();
  for (const c of data ?? []) {
    const list = closedByAccount.get(c.account_id) ?? [];
    list.push(new Date(c.closed_at as string).getTime());
    closedByAccount.set(c.account_id, list);
  }
  const windowMs = quickRestartDays * 86400000;
  for (const r of rows) {
    const opened = new Date(r.opened_at).getTime();
    const hit = (closedByAccount.get(r.account_id) ?? []).some((closed) => closed <= opened && opened - closed <= windowMs);
    if (hit) flagged.add(r.case_id);
  }
  return flagged;
}

// 異常利用の検知（要件 3.2.3 ガードレール4）。自動的な利用停止は行わず、確認の契機としてフラグを出すだけ。
// 閾値はサービス全体設定（frequent_days / frequent_cases / repeated_adjustments）
export async function frequentUseFlags(
  event: H3Event,
  rows: { case_id: string; account_id: string }[],
  frequentDays: number,
  frequentCases: number,
): Promise<Set<string>> {
  const flagged = new Set<string>();
  const accountIds = [...new Set(rows.map((r) => r.account_id))];
  if (accountIds.length === 0) return flagged;
  const since = new Date(Date.now() - frequentDays * 86400000).toISOString();
  const { data, error } = await serviceDb(event).from("cases").select("account_id").in("account_id", accountIds).gte("opened_at", since);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const count = new Map<string, number>();
  for (const c of data ?? []) count.set(c.account_id, (count.get(c.account_id) ?? 0) + 1);
  for (const r of rows) if ((count.get(r.account_id) ?? 0) >= frequentCases) flagged.add(r.case_id);
  return flagged;
}

// 利用者が削除した案件（要件 9.3）。削除の日時と、物理削除の予定日時
export async function deletedCases(event: H3Event, caseIds: string[]): Promise<Map<string, { requestedAt: string; purgeAfter: string | null }>> {
  const result = new Map<string, { requestedAt: string; purgeAfter: string | null }>();
  if (caseIds.length === 0) return result;
  const { data, error } = await serviceDb(event)
    .from("deletion_requests")
    .select("target_id, requested_at, purge_after")
    .eq("target_type", "case")
    .in("target_id", caseIds);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  for (const d of data ?? []) result.set(d.target_id, { requestedAt: d.requested_at, purgeAfter: d.purge_after });
  return result;
}

// 契約クライアントの名称（案件に複写されたクライアント。要件 7.2）
export async function clientNames(event: H3Event, clientIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(clientIds.filter((x): x is string => Boolean(x)))];
  const result = new Map<string, string>();
  if (ids.length === 0) return result;
  const { data, error } = await serviceDb(event).from("clients").select("client_id, name").in("client_id", ids);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  for (const c of data ?? []) result.set(c.client_id, c.name);
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
