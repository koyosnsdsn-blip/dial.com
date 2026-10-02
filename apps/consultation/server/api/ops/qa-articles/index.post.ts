// 記事の直接作成（要件 7.11.1）。初期アーカイブなど、利用者の投稿を経由しない記事。
// - 投稿者の表示IDは付けない。「運営が作成した記事」として表示する
// - 過去の相談を素材にする場合は、その相談について二次利用の同意が済んでいることが条件（9.4）
// - publish が false なら下書き（公開しない）。【仮】予約公開は未対応
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const body = await readBody<{ genreId?: unknown; question?: unknown; answer?: unknown; sourceCaseId?: unknown; publish?: unknown; checked?: unknown }>(event);
  const genreId = requireUuid(body?.genreId, "genre");
  const question = requireText(body?.question, "question", 2000);
  const answer = requireText(body?.answer, "answer", 5000);
  if (body?.checked !== true) throw createError({ statusCode: 400, statusMessage: "checklist_not_confirmed" });
  const db = serviceDb(event);
  const { data: g } = await db.from("genres").select("genre_id").eq("genre_id", genreId).maybeSingle();
  if (!g) throw createError({ statusCode: 400, statusMessage: "invalid_genre" });

  let sourceCaseId: string | null = null;
  if (body?.sourceCaseId) {
    sourceCaseId = requireUuid(body.sourceCaseId, "case_id");
    const { data: consent } = await db.from("reuse_consents").select("status").eq("case_id", sourceCaseId).maybeSingle();
    if (consent?.status !== "agreed") throw createError({ statusCode: 409, statusMessage: "reuse_not_agreed" });
    // 同意のあとで本人が相談を削除（または退会）した場合は、素材にしない
    const { data: gone } = await db.from("deletion_requests").select("request_id").eq("target_type", "case").eq("target_id", sourceCaseId).limit(1);
    if ((gone ?? []).length) throw createError({ statusCode: 409, statusMessage: "case_deleted" });
  }
  const publish = body?.publish === true;
  const now = new Date().toISOString();

  await writeAudit(event, staff, { action: "qa.article.create", targetType: "questions", reason: sourceCaseId ? `素材の相談 ${sourceCaseId}` : null });
  const { data: q, error } = await db
    .from("questions")
    .insert({ genre_id: genreId, body: question, status: "published", operator_created: true, published_at: now, unpublished_at: publish ? null : now, unpublish_reason: publish ? null : "draft", source_case_id: sourceCaseId })
    .select("question_id")
    .single();
  if (error || !q) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  const { error: answerError } = await db.from("answers").insert({ question_id: q.question_id, counselor_id: staff.userId, body: answer, published_at: now });
  if (answerError) {
    await db.from("questions").delete().eq("question_id", q.question_id);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  await db.from("question_actions").insert({ question_id: q.question_id, action: "publish", counselor_id: staff.userId });
  return { questionId: q.question_id as string };
});
