// 機能1（Q&A）の共通処理（相談者側）
//
// 守ること：
//   - 投稿者のアカウントID（questions.account_id）と回答者（answers.counselor_id）は、どの応答にも含めない（要件 2.6・3.6.1）
//   - 回答の全文を読めない利用者には、サーバー側で切り詰めた文字列だけを返す（画面側でぼかす方式にしない：要件 2.4）
//   - 公開中（公開済み・非公開化されていない・削除されていない）の記事だけを返す
import type { SupabaseClient } from "@supabase/supabase-js";

export const ANSWER_PREVIEW = 30;

export function preview(text: string, n: number): string {
  const chars = Array.from(text ?? "");
  return chars.length <= n ? chars.join("") : chars.slice(0, n).join("");
}

export function publicQuestions(db: SupabaseClient, columns: string) {
  return db.from("questions").select(columns, { count: "exact" }).eq("status", "published").is("unpublished_at", null).is("hidden_at", null);
}

// 検索語から、絞り込みの式を壊す文字を取り除く
export function cleanKeyword(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[%_,()\\*"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 50);
}

export const REPORT_CODES = ["identifiable", "inappropriate", "incorrect", "other"] as const;

export function qaRpcError(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? "";
  const known: Record<string, number> = {
    not_eligible: 403,
    posting_suspended: 403,
    quota_exceeded: 409,
    read_quota_exceeded: 409,
    already_reported: 409,
    invalid_resubmit: 400,
    resubmit_limit: 409,
    invalid_genre: 400,
    invalid_code: 400,
    empty_body: 400,
    body_too_long: 400,
    not_found: 404,
  };
  for (const [key, status] of Object.entries(known)) {
    if (msg.includes(key)) throw createError({ statusCode: status, statusMessage: key === "not_eligible" ? "qa_not_eligible" : key === "not_found" ? "qa_not_found" : key === "body_too_long" ? "question_too_long" : key });
  }
  console.error("[qa rpc] failed", error?.code);
  throw createError({ statusCode: 500, statusMessage: "update_failed" });
}
