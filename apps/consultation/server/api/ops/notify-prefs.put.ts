// 通知音の設定（本人の分）を保存する。相談員・運営管理者のどちらも、自分の設定だけ変えられる。
// 相談内容は扱わないため、監査ログは残さない。
import { requireStaff } from "../../ops/auth";
import { serviceDb } from "../../ops/db";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const body = await readBody<{ soundEnabled?: unknown; message?: unknown; case?: unknown; urgent?: unknown }>(event);
  for (const v of [body?.soundEnabled, body?.message, body?.case, body?.urgent]) {
    if (typeof v !== "boolean") throw createError({ statusCode: 400, statusMessage: "invalid_prefs" });
  }
  const { error } = await serviceDb(event)
    .from("staff_notify_prefs")
    .upsert(
      {
        counselor_id: staff.userId,
        sound_enabled: body.soundEnabled,
        notify_message: body.message,
        notify_case: body.case,
        notify_urgent: body.urgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "counselor_id" },
    );
  if (error) throw createError({ statusCode: 500, statusMessage: "save_failed" });
  return { ok: true };
});
