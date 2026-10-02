// 追加設問の変更・取り下げ（要件 7.10.5）。運営管理者のみ。理由は必須。
//
//   action = "retire"  … 設問を取り下げる（以後は表示しない）。過去の回答は残る
//   action = "edit"    … 設問文・選択肢・分類・集計対象を変更する
//
// 回答がすでにある設問を「edit」した場合は、元の設問を取り下げて、新しい設問として作り直す。
// 期中に設問を変えると、同じ設問に異なる意味の回答が混ざるため、旧設問の集計をその時点で打ち切る（7.10.5）。
// 過去の回答は、回答時点の設問文・選択肢ラベルを複写して保存しているので、意味は失われない（3.11.8）。
// 回答がまだない設問は、そのまま書き換える。
import { writeAudit } from "../../../../../ops/audit";
import { requireStaff } from "../../../../../ops/auth";
import { requireText } from "../../../../../ops/cases";
import { serviceDb } from "../../../../../ops/db";
import { hasAnswers, insertOptions, insertQuestion, parseSurveyInput, requireEditableClient } from "../../../../../ops/survey";
import { requireUuid } from "../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const questionId = requireUuid(getRouterParam(event, "qid"), "question_id");
  const body = await readBody<Record<string, unknown>>(event);
  const reason = requireText(body?.reason, "reason", 500);
  if (body?.action !== "retire" && body?.action !== "edit") throw createError({ statusCode: 400, statusMessage: "invalid_action" });

  const client = await requireEditableClient(event, clientId);
  if (client.status === "closed") throw createError({ statusCode: 409, statusMessage: "client_closed" });

  const db = serviceDb(event);
  // 共通設問（client_id が NULL）や他クライアントの設問は、この画面からは変更できない
  const { data: q, error } = await db
    .from("survey_questions")
    .select("survey_question_id, question_text, sort_order, active")
    .eq("survey_question_id", questionId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!q) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (!q.active) throw createError({ statusCode: 409, statusMessage: "survey_retired" });

  if (body.action === "retire") {
    await writeAudit(event, staff, {
      action: "survey.retire",
      targetType: "clients",
      targetId: clientId,
      reason: `${reason}（設問：${q.question_text}）`.slice(0, 2000),
    });
    const { error: updateError } = await db.from("survey_questions").update({ active: false }).eq("survey_question_id", questionId);
    if (updateError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    return { ok: true, replaced: false };
  }

  const input = parseSurveyInput(body);
  const answered = await hasAnswers(event, questionId);

  await writeAudit(event, staff, {
    action: "survey.update",
    targetType: "clients",
    targetId: clientId,
    reason: `${reason}（変更前：${q.question_text}／変更後：${input.text}／${answered ? "回答済みのため新しい設問として作り直し" : "書き換え"}／禁止事項の確認済み）`.slice(0, 2000),
  });

  if (answered) {
    const { error: retireError } = await db.from("survey_questions").update({ active: false }).eq("survey_question_id", questionId);
    if (retireError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    const newId = await insertQuestion(event, clientId, input, q.sort_order as number);
    return { ok: true, replaced: true, questionId: newId };
  }

  const { error: updateError } = await db
    .from("survey_questions")
    .update({ question_text: input.text, kind: input.kind, aggregatable: input.aggregatable })
    .eq("survey_question_id", questionId);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  const { error: delError } = await db.from("survey_options").delete().eq("survey_question_id", questionId);
  if (delError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  await insertOptions(event, questionId, input.options);
  return { ok: true, replaced: false };
});
