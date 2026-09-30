// 自分の投稿の一覧（要件 2.6・6.4.7）。処理の結果と理由、今月の残りの投稿数を返す。
// 担当者（相談員）の氏名・識別子は返さない
const REJECT_TEXT: Record<string, string> = {
  B: "このサービスではお答えできない内容でした（医療上の診断、法律上の判断など）。",
  E: "このままでは公開用の質問としてお答えすることが難しい内容でした。書き直して、もう一度投稿できます。",
  F: "公開の場よりも、個別のご相談としてお受けするほうがよい内容でした。",
};
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const f = await featuresOf(event, account);
  const db = serviceDb(event);
  const ym = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(new Date());

  const [{ data: rows, error }, { data: quota }, { data: acc }, { data: genres }] = await Promise.all([
    db.from("questions")
      .select("question_id, display_id, genre_id, body, status, merged_into, posted_at, published_at, unpublished_at, resubmitted_from, answers(body), question_actions(action, reason_code, reason_text, quota_returned, acted_at)")
      .eq("account_id", account.userId)
      .is("hidden_at", null)
      .order("posted_at", { ascending: false })
      .limit(200),
    db.from("post_quotas").select("used, returned").eq("account_id", account.userId).eq("year_month", ym).maybeSingle(),
    db.from("accounts").select("posting_suspended").eq("account_id", account.userId).maybeSingle(),
    db.from("genres").select("genre_id, name").order("sort_order"),
  ]);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const names = new Map((genres ?? []).map((g: any) => [g.genre_id as string, g.name as string]));
  const resubmitted = new Set(((rows ?? []) as any[]).map((r) => r.resubmitted_from).filter(Boolean));

  return {
    canPost: f.qaPost,
    suspended: Boolean(acc?.posting_suspended),
    remaining: f.qaPost ? Math.max(0, 3 - ((quota?.used ?? 0) - (quota?.returned ?? 0))) : 0,
    genres: (genres ?? []).map((g: any) => ({ genreId: g.genre_id as string, name: g.name as string })),
    items: ((rows ?? []) as any[]).map((r) => {
      const acts = ((r.question_actions ?? []) as any[]).sort((a, b) => String(b.acted_at).localeCompare(String(a.acted_at)));
      const last = acts.find((a) => a.action === "reject" || a.action === "discard") ?? null;
      const anonymized = acts.some((a) => a.action === "anonymize");
      return {
        questionId: r.question_id as string,
        displayId: r.display_id as string | null,
        genre: r.genre_id ? names.get(r.genre_id) ?? null : null,
        body: r.body as string,
        // 破棄は、利用者には「公開されませんでした」とだけ伝える（区分は返さない）
        status: (r.status === "discarded" ? "rejected" : r.status) as "pending" | "published" | "rejected" | "merged",
        unpublished: Boolean(r.unpublished_at),
        postedAt: r.posted_at as string,
        publishedAt: r.published_at as string | null,
        answer: r.status === "published" ? ((r.answers?.[0]?.body as string | undefined) ?? null) : null,
        // 匿名化のために運営が本文を修正した場合は、その旨を伝える（要件 6.4.2）
        anonymized,
        mergedInto: r.status === "merged" ? (r.merged_into as string | null) : null,
        reasonCode: last?.action === "reject" ? (last.reason_code as string | null) : null,
        // 却下は区分ごとの案内＋補足。破棄は定型文のみ（再投稿の案内はしない：6.4.1）
        reasonText: !last ? null : last.action === "discard" ? "この投稿は公開されませんでした。" : [REJECT_TEXT[last.reason_code] ?? "", last.reason_text ?? ""].filter(Boolean).join("\n"),
        quotaReturned: last ? Boolean(last.quota_returned) : r.status === "merged",
        canResubmit: f.qaPost && r.status === "rejected" && last?.reason_code === "E" && !resubmitted.has(r.question_id),
        needsConsultGuide: last?.action === "reject" && last.reason_code === "F",
      };
    }),
  };
});
