// 通知音の設定（本人の分）を返す。行がなければ既定値（鳴らさない。種類はすべて鳴らす）。
// 相談内容は扱わない。本人以外の設定は読めない（counselor_id を認証済みの本人に固定する）。
import { requireStaff } from "../../ops/auth";
import { serviceDb } from "../../ops/db";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const { data, error } = await serviceDb(event)
    .from("staff_notify_prefs")
    .select("sound_enabled, notify_message, notify_case, notify_urgent")
    .eq("counselor_id", staff.userId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  return {
    soundEnabled: data?.sound_enabled ?? false,
    message: data?.notify_message ?? true,
    case: data?.notify_case ?? true,
    urgent: data?.notify_urgent ?? true,
  };
});
