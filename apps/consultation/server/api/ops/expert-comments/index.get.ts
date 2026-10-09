// 先生のコメントの一覧（確認待ち・差し戻し中・公開中・非表示）。相談員・運営管理者。未決事項 2.19
// ?status=pending（既定）|returned|published|hidden|reported（未対応の通報があるもの。公開中・非表示の両方）。質問の本文（匿名化済みの公開内容）・先生の表示情報を併せて返す。
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
const STATUSES = ["pending", "returned", "published", "hidden"] as const;
const REASONS: Record<string, string> = { identifiable: "個人が特定され得る記述", inappropriate: "不適切な内容", incorrect: "誤った情報", other: "その他" };
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const q = getQuery(event).status;
  const reportedOnly = q === "reported";
  const status = STATUSES.find((s) => s === q) ?? "pending";
  const db = serviceDb(event);

  // 通報（未対応）。通報者は返さない。件数と理由だけ
  const { data: openReports, error: reportError } = await db.from("expert_comment_reports").select("comment_id, reason_code").is("resolution", null).limit(5000);
  if (reportError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const reports = new Map<string, { count: number; reasons: Record<string, number> }>();
  for (const r of openReports ?? []) {
    const item = reports.get(r.comment_id) ?? { count: 0, reasons: {} };
    item.count++;
    const label = REASONS[r.reason_code] ?? "その他";
    item.reasons[label] = (item.reasons[label] ?? 0) + 1;
    reports.set(r.comment_id, item);
  }

  let request = db
    .from("expert_comments")
    .select("comment_id, body, status, review_note, submitted_at, published_at, hidden_at, question:questions(question_id, display_id, body, genre_id), expert:experts(display_name, qualification, affiliation)")
    .order("submitted_at", { ascending: status === "pending" })
    .limit(200);
  request = reportedOnly ? request.in("comment_id", [...reports.keys()].slice(0, 200)).in("status", ["published", "hidden"]) : request.eq("status", status);
  const { data, error } = reportedOnly && reports.size === 0 ? { data: [], error: null } : await request;
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const { data: genres } = await db.from("genres").select("genre_id, name");
  const genreName = new Map((genres ?? []).map((g: any) => [g.genre_id as string, g.name as string]));

  await writeAudit(event, staff, { action: "expert_comment.list", targetType: "expert_comments", reason: reportedOnly ? "reported" : status });

  return ((data ?? []) as any[]).map((c) => ({
    commentId: c.comment_id as string,
    body: c.body as string,
    status: c.status as string,
    reviewNote: (c.review_note as string | null) ?? null,
    submittedAt: (c.submitted_at as string | null) ?? null,
    reports: reports.get(c.comment_id) ?? null,
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
