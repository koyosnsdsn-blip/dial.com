// 社内業務用：日次サマリの CSV（要件 7.9.3）。日本時間の1日ごとに1行。
// - 出力できる範囲は本人の権限（RLS）に従う：運営管理者は全体、相談員は自分の担当分
// - 未返信の残件数は「出力時点」の値のため、最終行（出力時点）にのみ意味がある。各日の列には出さない
// 【仮】SLA遵守率は暦時間で判定（未決事項 No.47）。その日に返信した相談のうち、最初の返信が SLA 時間内だった割合
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const range = exportRange(event);
  const db = await userDb(event);
  const day = (iso: string) => jstDateTime(iso).slice(0, 10);

  const [{ data: opened, error: e1 }, { data: closed, error: e2 }, { data: msgs, error: e3 }, { data: urgentLogs, error: e4 }] = await Promise.all([
    db.from("cases").select("case_id, client_id, opened_at").gte("opened_at", range.fromTs).lte("opened_at", range.toTs).limit(20000),
    db.from("cases").select("case_id, closed_at").gte("closed_at", range.fromTs).lte("closed_at", range.toTs).limit(20000),
    db.from("messages").select("case_id, sender, sent_at").gte("sent_at", range.fromTs).lte("sent_at", range.toTs).order("sent_at").limit(50000),
    staff.role === "admin"
      ? db.from("audit_logs").select("acted_at").eq("action", "case.urgent.set").gte("acted_at", range.fromTs).lte("acted_at", range.toTs).limit(20000)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if (e1 || e2 || e3 || e4) throw createError({ statusCode: 500, statusMessage: "query_failed" });

  // 最初の返信までの時間：その日に最初の返信があった案件について、案件の最初の相談者メッセージからの時間
  const replyCases = [...new Set((msgs ?? []).filter((m: any) => m.sender === "counselor").map((m: any) => m.case_id as string))];
  const firstUser = new Map<string, number>();
  const firstReply = new Map<string, string>();
  for (let i = 0; i < replyCases.length; i += 200) {
    const { data: all, error } = await db.from("messages").select("case_id, sender, sent_at").in("case_id", replyCases.slice(i, i + 200)).order("sent_at");
    if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const m of all ?? []) {
      if (m.sender === "user" && !firstUser.has(m.case_id)) firstUser.set(m.case_id, Date.parse(m.sent_at));
      if (m.sender === "counselor" && !firstReply.has(m.case_id)) firstReply.set(m.case_id, m.sent_at);
    }
  }
  const limits = await caseLimits(event, replyCases);

  type Row = { opened: number; corp: number; personal: number; replies: number; closed: number; urgent: number; first: number[]; within: number };
  const rows = new Map<string, Row>();
  const at = (d: string) => {
    if (!rows.has(d)) rows.set(d, { opened: 0, corp: 0, personal: 0, replies: 0, closed: 0, urgent: 0, first: [], within: 0 });
    return rows.get(d)!;
  };
  for (const c of opened ?? []) {
    const r = at(day(c.opened_at));
    r.opened++;
    if (c.client_id) r.corp++;
    else r.personal++;
  }
  for (const c of closed ?? []) at(day(c.closed_at)).closed++;
  for (const m of msgs ?? []) if (m.sender === "counselor") at(day(m.sent_at)).replies++;
  for (const l of urgentLogs ?? []) at(day(l.acted_at)).urgent++;
  for (const [caseId, repliedAt] of firstReply) {
    const received = firstUser.get(caseId);
    if (received === undefined) continue;
    const d = day(repliedAt);
    if (d < range.from || d > range.to) continue;
    const hours = Math.max(0, (Date.parse(repliedAt) - received) / 3600000);
    const r = at(d);
    r.first.push(hours);
    if (hours <= (limits.get(caseId)?.slaHours ?? 24)) r.within++;
  }

  await writeAudit(event, staff, { action: "export.daily", targetType: "cases", reason: `日次サマリ ${range.from}〜${range.to}` });

  const header = ["対象日", "新規案件数", "うち企業枠", "うち個人課金", "返信件数", "完了件数", "初回返信の件数", "平均初回返信時間（時間）", "SLA遵守率（暦時間・仮）", "緊急フラグの設定件数"];
  const out: unknown[][] = [];
  for (let t = Date.parse(`${range.from}T00:00:00Z`); t <= Date.parse(`${range.to}T00:00:00Z`); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const r = rows.get(d);
    const n = r?.first.length ?? 0;
    out.push([
      d,
      r?.opened ?? 0,
      r?.corp ?? 0,
      r?.personal ?? 0,
      r?.replies ?? 0,
      r?.closed ?? 0,
      n,
      n ? (r!.first.reduce((a, b) => a + b, 0) / n).toFixed(1) : "",
      n ? `${Math.round((r!.within / n) * 100)}%` : "",
      staff.role === "admin" ? r?.urgent ?? 0 : "",
    ]);
  }
  return sendCsv(event, `daily_${range.from}_${range.to}.csv`, toCsv(header, out));
});
