// 先生のコメントの一覧（確認待ち・差し戻し中・公開中・非表示）。相談員・運営管理者。未決事項 2.19
// ?status=pending（既定）|returned|published|hidden。質問の本文（匿名化済みの公開内容）・先生の表示情報を併せて返す。
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
const STATUSES = ["pending", "returned", "published", "hidden"] as const;
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const q = getQuery(event).status;
  const status = STATUSES.find((s) => s === q) ?? "pending";
  const db = serviceDb(event);

  const { data, error } = await db
    .from("expert_comments")
    .select("comment_id, body, status, review_note, submitted_at, published_at, hidden_at, question:questions(question_id, display_id, body, genre_id), expert:experts(display_name, qualification, affiliation)")
    .eq("status", status)
    .order("submitted_at", { ascending: status === "pending" })
    .limit(200);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const { data: genres } = await db.from("genres").select("genre_id, name");
  const genreName = new Map((genres ?? []).map((g: any) => [g.genre_id as string, g.name as string]));

  await writeAudit(event, staff, { action: "expert_comment.list", targetType: "expert_comments", reason: status });

  return ((data ?? []) as any[]).map((c) => ({
    commentId: c.comment_id as string,
    body: c.body as string,
    status: c.status as string,
    reviewNote: (c.review_note as string | null) ?? null,
    submittedAt: (c.submitted_at as string | null) ?? null,
    publishedAt: (c.published_at as string | null) ?? null,
    questionId: c.question?.question_id as string,
    displayId: (c.question?.display_id as string | null) ?? null,
    genre: genreName.get(c.question?.genre_id) ?? null,
    question: (c.question?.body as string) ?? "",
    expertName: (c.expert?.display_name as string) ?? "",
    expertQualification: (c.expert?.qualification as string) ?? "",
    expertAffiliation: (c.expert?.affiliation as string | null) ?? null,
  }));
});
