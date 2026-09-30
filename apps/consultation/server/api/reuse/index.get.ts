// 二次利用（Q&A としての公開）への同意の依頼のうち、まだ答えていないもの（要件 9.4）。
// 相談の内容は返さない（どの相談についての依頼かが分かる日付だけ）
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const db = serviceDb(event);
  const { data: cases, error } = await (await userDb(event)).from("my_cases").select("case_id, opened_at").limit(500);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const ids = (cases ?? []).map((c: any) => c.case_id as string);
  if (ids.length === 0) return { items: [] };
  const { data, error: reuseError } = await db
    .from("reuse_consents")
    .select("case_id, requested_at, expires_at")
    .in("case_id", ids)
    .eq("status", "requested")
    .gt("expires_at", new Date().toISOString());
  if (reuseError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const opened = new Map((cases ?? []).map((c: any) => [c.case_id as string, c.opened_at as string]));
  return {
    items: (data ?? []).map((r: any) => ({
      caseId: r.case_id as string,
      openedAt: opened.get(r.case_id) ?? null,
      requestedAt: r.requested_at as string | null,
      expiresAt: r.expires_at as string | null,
    })),
  };
});
