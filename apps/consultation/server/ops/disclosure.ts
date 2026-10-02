// 開示請求（要件 7.13.2）で、本人へ渡すデータを組み立てる。
// 対象：登録情報、属性の回答、相談（やり取りの全文・アンケートの回答）、Q&A の投稿と処理の記録。
// 相談員の氏名は含めない（3.6.1）。呼び出し側で、権限の確認と監査ログの記録を先に済ませること
import type { H3Event } from "h3";
import { serviceDb } from "./db";
import { isNicknameEmail } from "./nickname";

export async function buildDisclosure(event: H3Event, accountId: string) {
  const db = serviceDb(event);
  const domain = useRuntimeConfig(event).public.nicknameDomain as string;
  const results = await Promise.all([
    db.from("accounts").select("email, tier, created_at").eq("account_id", accountId).maybeSingle(),
    db.from("account_attributes").select("question_text_snapshot, option_label_snapshot, answered_at, updated_at").eq("account_id", accountId),
    db.from("cases").select("case_id, status, close_reason, opened_at, closed_at").eq("account_id", accountId).order("opened_at"),
    db.from("questions").select("display_id, body, status, posted_at, published_at, answers(body), question_actions(action, reason_code, reason_text, acted_at)").eq("account_id", accountId).is("hidden_at", null).order("posted_at"),
    db.from("deletion_requests").select("target_id").eq("account_id", accountId).eq("target_type", "case"),
  ]);
  // 一部でも取得に失敗したら、欠けたデータを渡さないよう、出力そのものを中止する
  if (results.some((r) => r.error)) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const [{ data: acc }, { data: attrs }, { data: cases }, { data: questions }, { data: deleted }] = results as any[];
  // 本人が削除した相談は、開示の対象に含めない（削除の求めを優先する）
  const gone = new Set((deleted ?? []).map((d: any) => d.target_id as string));
  const ids = (cases ?? []).map((c: any) => c.case_id as string).filter((id: string) => !gone.has(id));
  let messages: any[] = [];
  let answers: any[] = [];
  if (ids.length) {
    const [m, a] = await Promise.all([
      db.from("messages").select("case_id, sender, body, sent_at").in("case_id", ids).is("hidden_at", null).order("sent_at"),
      db.from("case_survey_answers").select("case_id, kind, question_text_snapshot, option_label_snapshot").in("case_id", ids),
    ]);
    if (m.error || a.error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    messages = m.data ?? [];
    answers = a.data ?? [];
  }
  const status: Record<string, string> = { pending: "確認中", published: "公開", rejected: "却下", discarded: "破棄", merged: "既存のQ&Aへ統合" };
  return {
    出力日時: new Date().toISOString(),
    登録情報: { メールアドレス: isNicknameEmail(acc?.email ?? null, domain) ? "（ニックネームで登録）" : acc?.email ?? null, 登録日時: acc?.created_at ?? null },
    属性の回答: (attrs ?? []).map((a: any) => ({ 設問: a.question_text_snapshot, 回答: a.option_label_snapshot, 回答日時: a.answered_at, 最終変更日時: a.updated_at })),
    相談: (cases ?? [])
      .filter((c: any) => !gone.has(c.case_id))
      .map((c: any) => ({
        開始日時: c.opened_at,
        状態: c.status === "open" ? "対応中" : "終了",
        終了日時: c.closed_at,
        アンケートの回答: answers.filter((a) => a.case_id === c.case_id).map((a) => ({ 区分: a.kind === "attr" ? "属性" : "主訴", 設問: a.question_text_snapshot, 回答: a.option_label_snapshot })),
        やり取り: messages.filter((m) => m.case_id === c.case_id).map((m) => ({ 送信者: m.sender === "user" ? "本人" : "相談員", 送信日時: m.sent_at, 本文: m.body })),
      })),
    "Q&Aの投稿": ((questions ?? []) as any[]).map((q) => ({
      表示ID: q.display_id,
      投稿日時: q.posted_at,
      状態: status[q.status] ?? q.status,
      質問: q.body,
      回答: q.status === "published" ? (q.answers?.[0]?.body ?? null) : null,
      処理の記録: ((q.question_actions ?? []) as any[]).map((a) => ({ 処理: a.action, 区分: a.reason_code, 理由: a.reason_text, 日時: a.acted_at })),
    })),
  };
}
