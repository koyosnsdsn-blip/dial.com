import { AUTO_TEXT_DEFAULTS, AUTO_TEXT_LABELS } from "../../../utils/autoTexts";
// 自動文面の一覧（要件 7.14.3）。運営管理者のみ。clientId を指定すると、そのクライアント向けの上書きを返す。
// 緊急時の案内・開示範囲の説明は、ここには出さない（全社共通・固定で、上書きを認めない）
export default defineEventHandler(async (event) => {
  await requireStaff(event, { adminOnly: true });
  const q = getQuery(event);
  const clientId = typeof q.clientId === "string" && q.clientId ? requireUuid(q.clientId, "client_id") : null;
  const { data, error } = await serviceDb(event).from("auto_texts").select("text_key, client_id, body, updated_at");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const global = new Map((data ?? []).filter((r: any) => r.client_id === null).map((r: any) => [r.text_key as string, r]));
  const local = new Map((data ?? []).filter((r: any) => clientId && r.client_id === clientId).map((r: any) => [r.text_key as string, r]));
  return Object.keys(AUTO_TEXT_DEFAULTS).map((key) => ({
    key,
    label: AUTO_TEXT_LABELS[key]?.label ?? key,
    vars: AUTO_TEXT_LABELS[key]?.vars ?? [],
    builtin: AUTO_TEXT_DEFAULTS[key],
    // この画面で編集する対象（全体の既定 or クライアント別）の上書き。なければ null
    override: ((clientId ? local.get(key) : global.get(key))?.body as string | undefined) ?? null,
    // クライアント別を編集しているときに、上書きがなければ使われる文面（全体の既定の上書き、または組み込みの文面）
    inherited: clientId ? ((global.get(key)?.body as string | undefined) ?? AUTO_TEXT_DEFAULTS[key]) : AUTO_TEXT_DEFAULTS[key],
    updatedAt: ((clientId ? local.get(key) : global.get(key))?.updated_at as string | undefined) ?? null,
  }));
});
