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

  // 相談員別の実績（直近30日に開始された案件。要件 7.12.1）：担当件数、平均初回返信時間、SLA遵守率
  // 【仮】SLA遵守は暦時間で判定（未決事項 No.47）。メッセージは送受信の日時だけを読む（本文は読まない）
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: recent, error: recentError } = await db
    .from("cases")
    .select("case_id, counselor_id, entitlement:entitlements(sla_hours)")
    .gte("opened_at", since)
    .not("counselor_id", "is", null)
    .limit(5000);
  if (recentError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const stats = new Map<string, { cases: number; first: number[]; within: number }>();
  const recentIds = (recent ?? []).map((c: any) => c.case_id as string);
  const firstUser = new Map<string, number>();
  const firstReply = new Map<string, number>();
  for (let i = 0; i < recentIds.length; i += 200) {
    const { data: ms, error: msError } = await db.from("messages").select("case_id, sender, sent_at").in("case_id", recentIds.slice(i, i + 200)).order("sent_at");
    if (msError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const m of ms ?? []) {
      const map = m.sender === "user" ? firstUser : firstReply;
      if (!map.has(m.case_id)) map.set(m.case_id, Date.parse(m.sent_at));
    }
  }
  for (const c of (recent ?? []) as any[]) {
    const s = stats.get(c.counselor_id) ?? { cases: 0, first: [], within: 0 };
    s.cases++;
    const u = firstUser.get(c.case_id);
    const r = firstReply.get(c.case_id);
    if (u !== undefined && r !== undefined) {
      const hours = Math.max(0, (r - u) / 3600000);
      s.first.push(hours);
      if (hours <= (c.entitlement?.sla_hours ?? 24)) s.within++;
    }
    stats.set(c.counselor_id, s);
  }

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
      recentCases: stats.get(r.counselor_id)?.cases ?? 0,
      avgFirstReplyHours: stats.get(r.counselor_id)?.first.length
        ? Math.round((stats.get(r.counselor_id)!.first.reduce((a, b) => a + b, 0) / stats.get(r.counselor_id)!.first.length) * 10) / 10
        : null,
      slaRate: stats.get(r.counselor_id)?.first.length
        ? Math.round((stats.get(r.counselor_id)!.within / stats.get(r.counselor_id)!.first.length) * 100)
        : null,
    };
  });
});
