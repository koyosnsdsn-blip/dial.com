// 同じ相談者の、過去の相談の一覧（要件 3.9・7.3）。経緯を把握するための画面。
// - 見えている案件（担当の案件。運営管理者は全件）の相談者についてだけ返す
// - 過去の案件は、別の相談員が担当していたものも含む（継続相談の経緯を把握するため）。このため service role で読み、
//   参照を監査ログに残す
// - 本人が削除した相談は含めない
// - AI による経緯サマリは、LLM が未設定の間は作らない。代わりに、この一覧から元のやり取りを開いて確認する
import { writeAudit } from "../../../../../ops/audit";
import { requireStaff } from "../../../../../ops/auth";
import { requireVisibleCase } from "../../../../../ops/cases";
import { serviceDb } from "../../../../../ops/db";
import { llmStatus } from "../../../../../ops/llm";
import { requireUuid } from "../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const caseId = requireUuid(getRouterParam(event, "id"), "case_id");
  const c = await requireVisibleCase(event, caseId);
  const db = serviceDb(event);
  const [{ data: rows, error }, { data: gone }] = await Promise.all([
    db.from("cases").select("case_id, status, close_reason, opened_at, closed_at, counselor_id").eq("account_id", c.account_id).neq("case_id", caseId).eq("status", "closed").order("opened_at", { ascending: false }).limit(50),
    db.from("deletion_requests").select("target_id").eq("account_id", c.account_id).eq("target_type", "case"),
  ]);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const deleted = new Set((gone ?? []).map((d: any) => d.target_id as string));
  const past = ((rows ?? []) as any[]).filter((r) => !deleted.has(r.case_id));
  const ids = past.map((r) => r.case_id as string);
  const chief = new Map<string, string[]>();
  if (ids.length) {
    const { data: answers, error: aError } = await db.from("case_survey_answers").select("case_id, option_label_snapshot").in("case_id", ids).eq("kind", "chief");
    if (aError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    for (const a of answers ?? []) chief.set(a.case_id, [...(chief.get(a.case_id) ?? []), a.option_label_snapshot]);
  }
  const names = new Map<string, string>();
  const counselorIds = [...new Set(past.map((r) => r.counselor_id).filter(Boolean))];
  if (counselorIds.length) {
    const { data: people } = await db.from("counselors").select("counselor_id, name").in("counselor_id", counselorIds);
    for (const p of people ?? []) names.set(p.counselor_id, p.name);
  }
  await writeAudit(event, staff, { action: "case.history.list", targetType: "cases", targetId: caseId });
  return {
    llm: llmStatus(event),
    items: past.map((r) => ({
      caseId: r.case_id as string,
      openedAt: r.opened_at as string,
      closedAt: r.closed_at as string | null,
      closeReason: r.close_reason as string | null,
      counselorName: r.counselor_id ? names.get(r.counselor_id) ?? null : null,
      chief: chief.get(r.case_id) ?? [],
    })),
  };
});
