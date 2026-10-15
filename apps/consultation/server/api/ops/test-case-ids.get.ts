// テスト案件の案件IDの一覧（通知音の判定用）。相談員・運営管理者。
// 画面は Realtime の合図（新着メッセージなど）が来たとき、その案件がテストかをこの一覧で判断し、テストの案件では通知音を鳴らさない
// （事前に知らされていない相談員がテストの音に反応しないように）。IDだけを返し、内容は返さない。
// 本人の権限（RLS）で読むため、相談員は担当案件のうちテストのもの、運営管理者は全体のうちテストのもの。参照を監査ログに記録する。
import { writeAudit } from "../../ops/audit";
import { requireStaff } from "../../ops/auth";
import { userDb } from "../../ops/db";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const { data, error } = await (await userDb(event)).from("cases").select("case_id").eq("is_test", true).limit(5000);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  await writeAudit(event, staff, { action: "case.test_ids", targetType: "cases" });
  return (data ?? []).map((r: any) => r.case_id as string);
});
