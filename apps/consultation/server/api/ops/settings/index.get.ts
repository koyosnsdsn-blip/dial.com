// サービス全体設定の一覧（要件 7.18）。運営管理者のみ。
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
import { SETTING_DEFS, getSettings } from "../../../ops/settings";
export default defineEventHandler(async (event) => {
  await requireStaff(event, { adminOnly: true });
  const values = await getSettings(event);
  const { data } = await serviceDb(event).from("system_settings").select("setting_key, updated_at");
  const updated = new Map((data ?? []).map((r: any) => [r.setting_key as string, r.updated_at as string]));
  return SETTING_DEFS.map((d) => ({ ...d, value: values[d.key]!, isDefault: !updated.has(d.key), updatedAt: updated.get(d.key) ?? null }));
});
