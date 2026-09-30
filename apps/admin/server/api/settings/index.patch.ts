// サービス全体設定の変更（要件 7.18）。運営管理者のみ。理由は必須で、変更前後を監査ログに記録する。
// 進行中の案件に複写済みの値（ラリー回数・SLA）は、ここでは扱わない。
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<{ key?: unknown; value?: unknown; reason?: unknown }>(event);
  const reason = requireText(body?.reason, "reason", 500);
  const def = SETTING_DEFS.find((d) => d.key === body?.key);
  if (!def) throw createError({ statusCode: 400, statusMessage: "invalid_key" });
  const value = Number(body?.value);
  if (!Number.isInteger(value) || value < def.min || value > def.max) throw createError({ statusCode: 400, statusMessage: "invalid_value" });

  const before = (await getSettings(event))[def.key];
  if (before === value) return { ok: true, unchanged: true };

  await writeAudit(event, staff, {
    action: "settings.update",
    targetType: "system_settings",
    reason: `${reason}（${def.label}：${before}→${value}${def.unit}）`.slice(0, 2000),
  });
  const { error } = await serviceDb(event)
    .from("system_settings")
    .upsert({ setting_key: def.key, setting_value: String(value), updated_by: staff.userId, updated_at: new Date().toISOString() }, { onConflict: "setting_key" });
  if (error) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  return { ok: true };
});
