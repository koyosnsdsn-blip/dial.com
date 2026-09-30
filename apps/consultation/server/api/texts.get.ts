import { AUTO_TEXT_DEFAULTS } from "../../utils/autoTexts";
// 自動文面の上書き（要件 7.14.3）。全体の既定の上書きと、所属クライアント別の上書きを重ねて返す（クライアント別が優先）。
// 既定の文面そのものは画面側が持っているため、ここでは上書きされたものだけを返す
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event);
  const { data, error } = await serviceDb(event).from("auto_texts").select("text_key, client_id, body");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const out: Record<string, string> = {};
  for (const r of (data ?? []).filter((x: any) => x.client_id === null)) if (r.text_key in AUTO_TEXT_DEFAULTS) out[r.text_key] = r.body;
  if (account.clientId) {
    for (const r of (data ?? []).filter((x: any) => x.client_id === account.clientId)) if (r.text_key in AUTO_TEXT_DEFAULTS) out[r.text_key] = r.body;
  }
  return out;
});
