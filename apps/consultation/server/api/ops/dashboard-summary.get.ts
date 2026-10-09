// ダッシュボードの件数（要件 7.1）。絞り込みに関係なく、全体の状況を返す。
// - 案件の件数は本人の権限（RLS）で数える：相談員は担当分、運営管理者は全体
// - 未返信の件数が閾値以上なら、稼働逼迫の警告を出す（利用の受付は止めない：3.2.3 ガードレール3）
// - 運営管理者には、未処理の問い合わせ・削除の失敗の件数も返す
import { requireStaff } from "../../ops/auth";
import { serviceDb, userDb } from "../../ops/db";
import { getSettings } from "../../ops/settings";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const db = await userDb(event);
  const count = async (q: any) => {
    const { count: n, error } = await q;
    if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
    return (n as number | null) ?? 0;
  };
  const open = () => db.from("cases").select("case_id", { count: "exact", head: true }).eq("status", "open");
  const [awaiting, urgent, unassigned, settings] = await Promise.all([
    count(open().not("awaiting_reply_since", "is", null)),
    count(open().eq("urgent_flag", true)),
    count(open().is("counselor_id", null)),
    getSettings(event),
  ]);
  // 機能1：回答待ちの投稿・未対応の通報（相談員も対応するため、全員に返す）
  const sdbAll = serviceDb(event);
  const [qaPending, qaReports, expertPending, expertReports] = await Promise.all([
    count(sdbAll.from("questions").select("question_id", { count: "exact", head: true }).eq("status", "pending").is("hidden_at", null)),
    count(sdbAll.from("reports").select("report_id", { count: "exact", head: true }).is("resolution", null)),
    // 先生のコメント：確認待ち／未対応の通報（相談員が確認するため、全員に返す）
    count(sdbAll.from("expert_comments").select("comment_id", { count: "exact", head: true }).eq("status", "pending")),
    count(sdbAll.from("expert_comment_reports").select("report_id", { count: "exact", head: true }).is("resolution", null)),
  ]);
  let disclosuresOpen = 0;
  let reuseWaiting = 0;
  let inquiries = 0;
  let deletionFailed = 0;
  let deletionPending = 0;
  if (staff.role === "admin") {
    const sdb = serviceDb(event);
    [disclosuresOpen, reuseWaiting] = await Promise.all([
      count(sdb.from("disclosure_requests").select("request_id", { count: "exact", head: true }).is("completed_at", null)),
      count(sdb.from("reuse_consents").select("case_id", { count: "exact", head: true }).eq("status", "requested")),
    ]);
    [inquiries, deletionFailed, deletionPending] = await Promise.all([
      count(sdb.from("inquiries").select("inquiry_id", { count: "exact", head: true }).eq("status", "open")),
      count(sdb.from("deletion_requests").select("request_id", { count: "exact", head: true }).eq("execution_status", "failed")),
      count(sdb.from("deletion_requests").select("request_id", { count: "exact", head: true }).eq("execution_status", "pending")),
    ]);
  }
  return { awaiting, urgent, unassigned, busy: awaiting >= settings.busy_threshold!, busyThreshold: settings.busy_threshold!, inquiries, deletionFailed, deletionPending, qaPending, qaReports, expertPending, expertReports, disclosuresOpen, reuseWaiting };
});
