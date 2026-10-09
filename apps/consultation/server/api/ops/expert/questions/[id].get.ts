// 先生が見る質問の詳細：質問、相談員の回答、自分のコメント（下書き・差し戻しの理由を含む）。未決事項 2.19
// 質問が先生の担当ジャンルの公開済みでなければ 404（存在も教えない）。
import { requireExpert } from "../../../../ops/expert";
import { serviceDb, userDb } from "../../../../ops/db";
import { requireUuid } from "../../../../utils/validate";
export default defineEventHandler(async (event) => {
  await requireExpert(event);
  const id = requireUuid(getRouterParam(event, "id"), "question_id");
  const db = await userDb(event);
  const { data: visible, error } = await db.rpc("expert_visible_questions");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const q = ((visible ?? []) as any[]).find((v) => v.question_id === id);
  if (!q) throw createError({ statusCode: 404, statusMessage: "not_found" });

  const svc = serviceDb(event);
  const [{ data: genre }, { data: answer }, { data: comment, error: commentError }] = await Promise.all([
    q.genre_id ? svc.from("genres").select("name").eq("genre_id", q.genre_id).maybeSingle() : Promise.resolve({ data: null }),
    svc.from("answers").select("body, published_at").eq("question_id", id).not("published_at", "is", null).order("published_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("expert_comments").select("comment_id, body, status, review_note, submitted_at, published_at").eq("question_id", id).maybeSingle(),
  ]);
  if (commentError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  return {
    questionId: q.question_id as string,
    displayId: (q.display_id as string | null) ?? null,
    genre: (genre?.name as string | undefined) ?? null,
    question: q.body as string,
    publishedAt: q.published_at as string | null,
    answer: (answer?.body as string | undefined) ?? null,
    comment: comment
      ? {
          commentId: comment.comment_id as string,
          body: comment.body as string,
          status: comment.status as "draft" | "pending" | "returned" | "published" | "hidden",
          reviewNote: (comment.review_note as string | null) ?? null,
          submittedAt: (comment.submitted_at as string | null) ?? null,
          publishedAt: (comment.published_at as string | null) ?? null,
        }
      : null,
  };
});
