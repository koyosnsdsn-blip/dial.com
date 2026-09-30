// 契約クライアントの一覧（要件 7.10.1）。運営管理者のみ。
// 登録件数は、招待コードで所属が付いたアカウントの数（誰が登録しているかは返さない：要件 3.10.5）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const db = serviceDb(event);

  const [{ data: rows, error }, { data: members, error: memberError }, { data: openCases, error: caseError }] = await Promise.all([
    db
      .from("clients")
      .select("client_id, name, contract_type, status, contract_start, contract_end, employee_count, feature_qa, feature_consult, feature_video, sla_hours, rally_max, invite_code, created_at")
      .order("created_at", { ascending: false }),
    db.from("accounts").select("client_id").not("client_id", "is", null).is("deleted_at", null),
    db.from("cases").select("client_id").eq("status", "open").not("client_id", "is", null),
  ]);
  if (error || memberError || caseError) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  const count = (list: any[] | null) => {
    const m = new Map<string, number>();
    for (const r of list ?? []) m.set(r.client_id, (m.get(r.client_id) ?? 0) + 1);
    return m;
  };
  const memberCount = count(members);
  const openCount = count(openCases);

  await writeAudit(event, staff, { action: "client.list", targetType: "clients" });

  return (rows ?? []).map((r: any) => ({
    clientId: r.client_id as string,
    name: r.name as string,
    contractType: r.contract_type as "corp" | "muni",
    status: r.status as "prep" | "active" | "closed",
    contractStart: r.contract_start as string | null,
    contractEnd: r.contract_end as string | null,
    employeeCount: r.employee_count as number | null,
    featureQa: r.feature_qa as boolean,
    featureConsult: r.feature_consult as boolean,
    featureVideo: r.feature_video as boolean,
    slaHours: r.sla_hours as number,
    rallyMax: r.rally_max as number,
    hasInviteCode: Boolean(r.invite_code),
    members: memberCount.get(r.client_id) ?? 0,
    openCases: openCount.get(r.client_id) ?? 0,
  }));
});
