// 先生が見られる質問の一覧（担当ジャンルの、公開済み・匿名化済みの質問だけ）。未決事項 2.19
// 質問は account_id を含まない関数 expert_visible_questions() だけを通して、本人の権限（RLS）で読む。
// 公開済みの質問の一覧なので、参照そのものは監査ログに残さない（コメントの保存・提出は残す）。
import { requireExpert } from "../../../../ops/expert";
import { serviceDb } from "../../../../ops/db";
import { userDb } from "../../../../ops/db";
export default defineEventHandler(async (event) => {
  await requireExpert(event);
  const db = await userDb(event);
  const [{ data: questions, error }, { data: mine, error: mineError }] = await Promise.all([
    db.rpc("expert_visible_questions"),
    db.from("expert_comments").select("question_id, status"),
  ]);
  if (error || mineError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const { data: genres } = await serviceDb(event).from("genres").select("genre_id, name");
  const genreName = new Map((genres ?? []).map((g: any) => [g.genre_id as string, g.name as string]));
  const status = new Map((mine ?? []).map((c: any) => [c.question_id as string, c.status as string]));

  return ((questions ?? []) as any[])
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .slice(0, 300)
    .map((q) => ({
      questionId: q.question_id as string,
      displayId: (q.display_id as string | null) ?? null,
      genre: genreName.get(q.genre_id) ?? null,
      excerpt: Array.from(q.body as string).slice(0, 80).join(""),
      publishedAt: q.published_at as string | null,
      commentStatus: (status.get(q.question_id) ?? null) as "draft" | "pending" | "returned" | "published" | "hidden" | null,
    }));
});
