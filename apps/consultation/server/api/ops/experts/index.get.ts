// 先生の一覧（運営画面 /ops/experts）。運営管理者のみ。担当ジャンル、コメントの件数、招待中かどうかを併せて返す。未決事項 2.19
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const db = serviceDb(event);
  const [experts, genres, comments] = await Promise.all([
    db.from("experts").select("expert_id, display_name, qualification, affiliation, bio, status, contact_email, created_at").order("created_at"),
    db.from("expert_genres").select("expert_id, genre_id"),
    db.from("expert_comments").select("expert_id, status").limit(50000),
  ]);
  if (experts.error || genres.error || comments.error) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const { data: authUsers } = await db.auth.admin.listUsers({ perPage: 1000 });
  const authById = new Map((authUsers?.users ?? []).map((u) => [u.id, u]));

  const genresOf = new Map<string, string[]>();
  for (const g of genres.data ?? []) genresOf.set(g.expert_id, [...(genresOf.get(g.expert_id) ?? []), g.genre_id]);
  const counts = new Map<string, { published: number; pending: number }>();
  for (const c of comments.data ?? []) {
    const n = counts.get(c.expert_id) ?? { published: 0, pending: 0 };
    if (c.status === "published") n.published++;
    if (c.status === "pending") n.pending++;
    counts.set(c.expert_id, n);
  }

  await writeAudit(event, staff, { action: "expert.list", targetType: "experts" });

  return (experts.data ?? []).map((e: any) => {
    const u = authById.get(e.expert_id);
    return {
      expertId: e.expert_id as string,
      displayName: e.display_name as string,
      qualification: e.qualification as string,
      affiliation: (e.affiliation as string | null) ?? null,
      bio: (e.bio as string | null) ?? null,
      status: e.status as "active" | "suspended",
      email: (e.contact_email as string | null) ?? null,
      genreIds: genresOf.get(e.expert_id) ?? [],
      lastSignInAt: u?.last_sign_in_at ?? null,
      invited: Boolean(u && !u.last_sign_in_at),
      published: counts.get(e.expert_id)?.published ?? 0,
      pending: counts.get(e.expert_id)?.pending ?? 0,
    };
  });
});
