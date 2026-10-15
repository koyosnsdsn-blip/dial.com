// クライアント別の追加設問（要件 3.11.8・7.10.5）の共通処理
import type { H3Event } from "h3";
import { requireText } from "./cases";
import { serviceDb } from "./db";

// 全設問に必ず付ける選択肢。自動で付与し、削除できない（要件 3.11.2・7.10.5）
export const DECLINE_LABEL = "答えない";
// 追加設問は1クライアントにつき有効なものを2問まで（要件 3.11.8。DBのトリガでも拒否される）
export const MAX_EXTRA_QUESTIONS = 2;

export type SurveyInput = { text: string; kind: "attr" | "chief"; aggregatable: boolean; options: string[] };

// 入力の検査。選択肢は「答えない」を除いて2〜10個、重複不可
export function parseSurveyInput(body: Record<string, unknown> | null | undefined): SurveyInput {
  const text = requireText(body?.text, "question_text", 200);
  if (body?.kind !== "attr" && body?.kind !== "chief") throw createError({ statusCode: 400, statusMessage: "invalid_kind" });
  if (!Array.isArray(body?.options)) throw createError({ statusCode: 400, statusMessage: "invalid_options" });
  const options = (body.options as unknown[])
    .map((o) => (typeof o === "string" ? o.trim() : ""))
    .filter((o) => o !== "" && o !== DECLINE_LABEL);
  if (options.length < 2 || options.length > 10 || options.some((o) => o.length > 50) || new Set(options).size !== options.length) {
    throw createError({ statusCode: 400, statusMessage: "invalid_options" });
  }
  // 禁止事項（氏名・社員番号・メールアドレス・部署・拠点・役職・入社年次・性別）に当たらないことの確認（要件 3.11.8）
  if (body?.checklistConfirmed !== true) throw createError({ statusCode: 400, statusMessage: "checklist_not_confirmed" });
  return { text, kind: body.kind, aggregatable: body?.aggregatable === true, options };
}

// 設問と選択肢を、DBの関数で1回のトランザクションとして作る（途中で失敗して選択肢のない設問が残らないように）
export async function insertQuestion(event: H3Event, clientId: string, input: SurveyInput, sortOrder: number): Promise<string> {
  const { data, error } = await serviceDb(event).rpc("survey_create_question", {
    p_client: clientId,
    p_kind: input.kind,
    p_text: input.text,
    p_sort: sortOrder,
    p_aggregatable: input.aggregatable,
    p_options: input.options,
    p_decline: DECLINE_LABEL,
  });
  if (error) throw surveyWriteError(error);
  return data as string;
}

// 設問を取り下げて、新しい設問として作り直す（1回のトランザクション。どちらかが失敗すれば取り下げも取り消される）
export async function replaceQuestion(event: H3Event, oldId: string, clientId: string, input: SurveyInput, sortOrder: number): Promise<string> {
  const { data, error } = await serviceDb(event).rpc("survey_replace_question", {
    p_old: oldId,
    p_client: clientId,
    p_kind: input.kind,
    p_text: input.text,
    p_sort: sortOrder,
    p_aggregatable: input.aggregatable,
    p_options: input.options,
    p_decline: DECLINE_LABEL,
  });
  if (error) throw surveyWriteError(error);
  return data as string;
}

function surveyWriteError(error: { message?: string; code?: string }) {
  if ((error.message ?? "").includes("already has 2 active")) return createError({ statusCode: 409, statusMessage: "survey_limit" });
  console.error("[survey] write failed", error.code);
  return createError({ statusCode: 500, statusMessage: "update_failed" });
}

// 設問に回答が1件でもあるか（属性の回答、または案件に複写された回答）
export async function hasAnswers(event: H3Event, questionId: string): Promise<boolean> {
  const db = serviceDb(event);
  const [{ count: a }, { count: c }] = await Promise.all([
    db.from("account_attributes").select("*", { count: "exact", head: true }).eq("survey_question_id", questionId),
    db.from("case_survey_answers").select("*", { count: "exact", head: true }).eq("survey_question_id", questionId),
  ]);
  return (a ?? 0) + (c ?? 0) > 0;
}

// 追加設問は共通設問の後に表示する（共通設問の sort_order は 10〜50）
export async function nextSortOrder(event: H3Event, clientId: string): Promise<number> {
  const { data } = await serviceDb(event)
    .from("survey_questions")
    .select("sort_order")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: false })
    .limit(1);
  return Math.max(100, ((data?.[0]?.sort_order as number | undefined) ?? 90) + 10);
}

export async function requireEditableClient(event: H3Event, clientId: string) {
  const { data, error } = await serviceDb(event).from("clients").select("client_id, name, status, contract_type").eq("client_id", clientId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!data) throw createError({ statusCode: 404, statusMessage: "not_found" });
  return data as { client_id: string; name: string; status: string; contract_type: string };
}
