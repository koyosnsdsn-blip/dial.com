// 初回アンケートの設問（要件 3.11）。survey_* はブラウザに権限を与えていないため service role で読む。
import type { H3Event } from "h3";
import type { AccountContext } from "./auth";

export type SurveyQuestion = {
  questionId: string;
  kind: "attr" | "chief";
  text: string;
  options: { optionId: string; label: string }[];
};

// 利用者に表示し得る設問（共通設問＋所属クライアントの追加設問）。個人利用者には追加設問を出さない（要件 3.11.8）
export async function activeQuestions(event: H3Event, account: AccountContext): Promise<SurveyQuestion[]> {
  const db = serviceDb(event);
  let query = db
    .from("survey_questions")
    .select("survey_question_id, client_id, kind, question_text, sort_order, options:survey_options(option_id, label, sort_order)")
    .eq("active", true);
  query = account.clientId
    ? query.or(`client_id.is.null,client_id.eq.${account.clientId}`)
    : query.is("client_id", null);
  const { data, error } = await query;
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  // 共通設問を先に、追加設問を後に表示する（要件 7.10.5）
  const rows = (data ?? []).slice().sort((a: any, b: any) => {
    const ca = a.client_id ? 1 : 0;
    const cb = b.client_id ? 1 : 0;
    return ca - cb || a.sort_order - b.sort_order;
  });
  return rows.map((q: any) => ({
    questionId: q.survey_question_id as string,
    kind: q.kind as "attr" | "chief",
    text: q.question_text as string,
    options: (q.options ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((o: any) => ({ optionId: o.option_id as string, label: o.label as string })),
  }));
}

export type AttributeAnswer = { questionId: string; label: string; updatedAt: string | null };

export async function accountAttributes(event: H3Event, account: AccountContext): Promise<AttributeAnswer[]> {
  const { data, error } = await serviceDb(event)
    .from("account_attributes")
    .select("survey_question_id, option_label_snapshot, updated_at")
    .eq("account_id", account.userId);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (data ?? []).map((a: any) => ({
    questionId: a.survey_question_id as string,
    label: a.option_label_snapshot as string,
    updatedAt: a.updated_at as string | null,
  }));
}
