// 契約クライアントの選択肢（案件一覧の絞り込み用。要件 7.2）。相談員・運営管理者。
// 名称だけを返す（契約内容・招待コードは返さない）
import { requireStaff } from "../../ops/auth";
import { serviceDb } from "../../ops/db";
export default defineEventHandler(async (event) => {
  await requireStaff(event);
  const { data, error } = await serviceDb(event).from("clients").select("client_id, name, status, is_test").order("name");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return (data ?? []).map((c: any) => ({
    clientId: c.client_id as string,
    name: `${c.name}${c.status === "closed" ? "（終了）" : ""}${c.is_test ? "（テスト）" : ""}`,
  }));
});
