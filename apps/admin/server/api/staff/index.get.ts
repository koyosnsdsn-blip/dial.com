// 相談員・運営管理者の一覧（要件 7.12.1）。運営管理者のみ。
// 担当変更の選択肢にも使う。担当件数（対応中）を併せて返す。
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const db = serviceDb(event);

  const [{ data: rows, error }, { data: openCases, error: caseError }] = await Promise.all([
    db.from("counselors").select("counselor_id, name, role, status, absent_from, absent_to").order("name"),
    db.from("cases").select("counselor_id").eq("status", "open").not("counselor_id", "is", null),
  ]);
  if (error || caseError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  // 最終ログイン日時は auth.users にあるため Admin API で取得する（少人数前提）
  const { data: authUsers } = await db.auth.admin.listUsers({ perPage: 1000 });
  const authById = new Map((authUsers?.users ?? []).map((u) => [u.id, u]));

  const openCount = new Map<string, number>();
  for (const c of openCases ?? []) openCount.set(c.counselor_id, (openCount.get(c.counselor_id) ?? 0) + 1);

  await writeAudit(event, staff, { action: "staff.list", targetType: "counselors" });

  const today = new Date().toISOString().slice(0, 10);
  return (rows ?? []).map((r: any) => {
    const u = authById.get(r.counselor_id);
    return {
      counselorId: r.counselor_id as string,
      name: r.name as string,
      role: r.role as "admin" | "counselor",
      status: r.status as "active" | "expired",
      email: u?.email ?? null,
      lastSignInAt: u?.last_sign_in_at ?? null,
      invited: Boolean(u && !u.last_sign_in_at),
      absentFrom: r.absent_from as string | null,
      absentTo: r.absent_to as string | null,
      absentNow: Boolean(r.absent_from && r.absent_to && r.absent_from <= today && today <= r.absent_to),
      openCases: openCount.get(r.counselor_id) ?? 0,
      isSelf: r.counselor_id === staff.userId,
    };
  });
});
