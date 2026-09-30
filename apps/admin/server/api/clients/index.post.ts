// 契約クライアントの新規登録（要件 7.10.8）。運営管理者のみ。
// - 契約類型（企業契約型／自治体委託型）は登録時にのみ設定でき、以後変更できない（3.12.2）。
//   確認済みであること（typeConfirmed）を登録の条件にする
// - 登録直後は「準備中」。招待コードは自動発行するが、「有効」に切り替えるまで機能しない（7.10.9）
// - ラリー回数・返信SLAは既定値（往復1回・24時間）。登録後に設定画面で変更する
//   【仮】要件 7.10.8 は初期値を「往復5回」と記載しているが、3.2.5・7.10.3 の「企業枠の既定は1回」を採った
// 未実装：初回のクライアント管理者アカウントの発行（クライアント管理サイトが未実装のため）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<Record<string, unknown>>(event);

  const name = requireText(body?.name, "name", 100);
  if (body?.contractType !== "corp" && body?.contractType !== "muni") {
    throw createError({ statusCode: 400, statusMessage: "invalid_contract_type" });
  }
  if (body?.typeConfirmed !== true) throw createError({ statusCode: 400, statusMessage: "type_not_confirmed" });
  const plan = body?.plan;
  if (plan !== "full" && plan !== "consult" && plan !== "video") throw createError({ statusCode: 400, statusMessage: "invalid_plan" });
  const contractStart = optionalDate(body?.contractStart, "date");
  const contractEnd = optionalDate(body?.contractEnd, "date");
  if (contractStart && contractEnd && contractStart > contractEnd) throw createError({ statusCode: 400, statusMessage: "invalid_date" });

  const row = {
    name,
    contract_type: body.contractType,
    status: "prep",
    contract_start: contractStart,
    contract_end: contractEnd,
    employee_count: optionalInt(body?.employeeCount, "employee_count", 1, 10_000_000),
    assumed_usage_rate: optionalRate(body?.assumedUsageRate),
    invite_code: generateInviteCode(),
    feature_qa: plan === "full",
    feature_consult: plan === "full" || plan === "consult",
    feature_video: plan === "full" || plan === "video",
  };

  await writeAudit(event, staff, {
    action: "client.create",
    targetType: "clients",
    reason: `契約類型 ${row.contract_type}、プラン ${plan}`,
  });

  const { data, error } = await serviceDb(event).from("clients").insert(row).select("client_id").single();
  if (error) {
    console.error("[clients.create] failed", error.code);
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { clientId: data.client_id as string };
});
