// 契約クライアントの詳細（要件 7.10.2〜7.10.4）。運営管理者のみ。招待コードを含む。
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const db = serviceDb(event);

  const [{ data: r, error }, { count: members }, { count: openCases }, { count: totalCases }, { data: limited }, { data: counselors }] = await Promise.all([
    db.from("clients").select("*").eq("client_id", clientId).maybeSingle(),
    db.from("accounts").select("account_id", { count: "exact", head: true }).eq("client_id", clientId).is("deleted_at", null),
    db.from("cases").select("case_id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "open"),
    db.from("cases").select("case_id", { count: "exact", head: true }).eq("client_id", clientId),
    db.from("client_counselors").select("counselor_id").eq("client_id", clientId),
    db.from("counselors").select("counselor_id, name, role, status").order("name"),
  ]);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!r) throw createError({ statusCode: 404, statusMessage: "not_found" });

  // 今月（日本時間）の利用状況：案件数、利用者数、利用率（利用者数 ÷ 契約上の従業員数）。要件 3.2.3 ガードレール2
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const monthStart = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00+09:00`;
  const { data: monthCases, error: monthError } = await db.from("cases").select("account_id").eq("client_id", clientId).gte("opened_at", monthStart).limit(20000);
  if (monthError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const monthUsers = new Set((monthCases ?? []).map((c: any) => c.account_id as string)).size;
  const usageRate = r.employee_count ? Math.round((monthUsers / r.employee_count) * 10000) / 100 : null;
  const assumed = r.assumed_usage_rate === null ? null : Math.round(Number(r.assumed_usage_rate) * 10000) / 100;

  await writeAudit(event, staff, { action: "client.view", targetType: "clients", targetId: clientId });

  return {
    clientId: r.client_id as string,
    name: r.name as string,
    contractType: r.contract_type as "corp" | "muni",
    status: r.status as "prep" | "active" | "closed",
    contractStart: r.contract_start as string | null,
    contractEnd: r.contract_end as string | null,
    employeeCount: r.employee_count as number | null,
    // 保存は 0〜1 の割合。画面では百分率で扱う
    assumedUsageRate: r.assumed_usage_rate === null ? null : Math.round(Number(r.assumed_usage_rate) * 10000) / 100,
    featureQa: r.feature_qa as boolean,
    featureConsult: r.feature_consult as boolean,
    featureVideo: r.feature_video as boolean,
    slaHours: r.sla_hours as number,
    rallyMax: r.rally_max as number,
    inviteCode: r.invite_code as string | null,
    members: members ?? 0,
    openCases: openCases ?? 0,
    totalCases: totalCases ?? 0,
    monthCases: (monthCases ?? []).length,
    monthUsers,
    usageRate,
    // 想定利用率を超えているか（単価見直し条項の基準。企業契約型のみ）
    usageOver: usageRate !== null && assumed !== null && usageRate > assumed,
    // 登録件数が契約上の従業員数を超えているか（重複アカウントの検知の契機。要件 10.9）
    membersOver: Boolean(r.employee_count && (members ?? 0) > r.employee_count),
    counselorIds: (limited ?? []).map((x: any) => x.counselor_id as string),
    counselors: (counselors ?? []).map((c: any) => ({
      counselorId: c.counselor_id as string,
      name: c.name as string,
      role: c.role as string,
      status: c.status as string,
    })),
  };
});
