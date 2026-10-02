// 契約クライアントの設定変更（要件 7.10.2・7.10.3・7.10.9）。運営管理者のみ。理由は必須で、監査ログに変更前後を記録する。
// 変更できるもの：名称、契約期間、契約上の従業員数、想定利用率、機能の有効・無効、ラリー回数、返信SLA、
//                 割当対象の相談員、契約ステータス（準備中 → 有効 のみ。終了は専用のAPI）
// 守ること：
//   - 契約類型は変更できない（3.12.2。DBのトリガでも拒否される）
//   - ラリー回数・返信SLAはプリセットから選ぶ。24時間未満のSLA・4回以上のラリーは、体制側の承認者の記録が必要（3.2.4・3.2.5）
//   - 標準プラン以外の機能の組み合わせは、承認者の記録が必要（3.10.7）。すべて無効にはできない
//   - 設定変更は進行中の案件に適用されない（案件には利用権付与時点の値を複写済み）
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { RALLY_PRESETS, SLA_PRESETS, isStandardPlan, needsCapacityApproval, optionalDate, optionalInt, optionalRate } from "../../../ops/clients";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const clientId = requireUuid(getRouterParam(event, "id"), "client_id");
  const body = await readBody<Record<string, unknown>>(event);
  const reason = requireText(body?.reason, "reason", 500);

  const db = serviceDb(event);
  const { data: cur, error } = await db.from("clients").select("*").eq("client_id", clientId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!cur) throw createError({ statusCode: 404, statusMessage: "not_found" });
  if (cur.status === "closed") throw createError({ statusCode: 409, statusMessage: "client_closed" });

  const patch: Record<string, unknown> = {};
  const changes: string[] = [];
  const set = (column: string, label: string, next: unknown) => {
    if (next !== cur[column] && !(next === null && cur[column] === null)) {
      patch[column] = next;
      changes.push(`${label} ${cur[column] ?? "未設定"}→${next ?? "未設定"}`);
    }
  };

  if (body.name !== undefined) set("name", "名称", requireText(body.name, "name", 100));
  if (body.contractStart !== undefined) set("contract_start", "契約開始", optionalDate(body.contractStart, "date"));
  if (body.contractEnd !== undefined) set("contract_end", "契約終了", optionalDate(body.contractEnd, "date"));
  const start = (patch.contract_start ?? cur.contract_start) as string | null;
  const end = (patch.contract_end ?? cur.contract_end) as string | null;
  if (start && end && start > end) throw createError({ statusCode: 400, statusMessage: "invalid_date" });
  if (body.employeeCount !== undefined) set("employee_count", "従業員数", optionalInt(body.employeeCount, "employee_count", 1, 10_000_000));
  if (body.assumedUsageRate !== undefined) {
    const next = optionalRate(body.assumedUsageRate);
    if ((next === null) !== (cur.assumed_usage_rate === null) || (next !== null && Number(cur.assumed_usage_rate) !== next)) {
      patch.assumed_usage_rate = next;
      changes.push("想定利用率を変更");
    }
  }

  for (const [key, column, label] of [
    ["featureQa", "feature_qa", "機能1"],
    ["featureConsult", "feature_consult", "機能2"],
    ["featureVideo", "feature_video", "機能3"],
  ] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") throw createError({ statusCode: 400, statusMessage: "invalid_feature" });
      set(column, label, body[key]);
    }
  }
  const features = {
    qa: (patch.feature_qa ?? cur.feature_qa) as boolean,
    consult: (patch.feature_consult ?? cur.feature_consult) as boolean,
    video: (patch.feature_video ?? cur.feature_video) as boolean,
  };
  if (!features.qa && !features.consult && !features.video) throw createError({ statusCode: 400, statusMessage: "features_required" });

  if (body.rallyMax !== undefined) {
    const n = Number(body.rallyMax);
    if (!RALLY_PRESETS.includes(n)) throw createError({ statusCode: 400, statusMessage: "invalid_rally_max" });
    set("rally_max", "ラリー回数", n);
  }
  if (body.slaHours !== undefined) {
    const n = Number(body.slaHours);
    if (!SLA_PRESETS.includes(n)) throw createError({ statusCode: 400, statusMessage: "invalid_sla_hours" });
    set("sla_hours", "返信SLA", n);
  }

  if (body.status !== undefined && body.status !== cur.status) {
    // 準備中 → 有効 のみ。有効にすると招待コードが機能する（7.10.9）
    if (!(cur.status === "prep" && body.status === "active")) throw createError({ statusCode: 400, statusMessage: "invalid_status" });
    if (!cur.invite_code) throw createError({ statusCode: 409, statusMessage: "invite_code_missing" });
    set("status", "ステータス", "active");
  }

  // 割当対象の相談員の限定（空＝限定しない。要件 3.6・7.10.3）
  let counselorIds: string[] | null = null;
  if (body.counselorIds !== undefined) {
    if (!Array.isArray(body.counselorIds)) throw createError({ statusCode: 400, statusMessage: "invalid_counselor" });
    const next = [...new Set(body.counselorIds.map((x) => requireUuid(x, "counselor")))].sort();
    const { data: limited } = await db.from("client_counselors").select("counselor_id").eq("client_id", clientId);
    const before = (limited ?? []).map((x: any) => x.counselor_id as string).sort();
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      if (next.length > 0) {
        const { data: valid } = await db.from("counselors").select("counselor_id").in("counselor_id", next).eq("status", "active");
        if ((valid ?? []).length !== next.length) throw createError({ statusCode: 400, statusMessage: "invalid_counselor" });
      }
      counselorIds = next;
      changes.push(`割当対象の相談員 ${before.length || "限定なし"}→${next.length || "限定なし"}`);
    }
  }

  if (changes.length === 0) return { ok: true, unchanged: true };

  // 承認を要する設定に「変える」場合は、承認者の記録を求める
  const rallyMax = (patch.rally_max ?? cur.rally_max) as number;
  const slaHours = (patch.sla_hours ?? cur.sla_hours) as number;
  const touchesCapacity = "rally_max" in patch || "sla_hours" in patch;
  const touchesFeatures = "feature_qa" in patch || "feature_consult" in patch || "feature_video" in patch;
  let approvedBy = "";
  if ((touchesCapacity && needsCapacityApproval(rallyMax, slaHours)) || (touchesFeatures && !isStandardPlan(features))) {
    approvedBy = requireText(body.approvedBy, "approved_by", 100);
  }

  await writeAudit(event, staff, {
    action: "client.update",
    targetType: "clients",
    targetId: clientId,
    reason: `${reason}（変更：${changes.join("、")}${approvedBy ? `／承認者：${approvedBy}` : ""}）`.slice(0, 2000),
  });

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await db.from("clients").update(patch).eq("client_id", clientId);
    if (updateError) {
      console.error("[clients.update] failed", updateError.code);
      throw createError({ statusCode: 500, statusMessage: "update_failed" });
    }
  }
  if (counselorIds) {
    const { error: delError } = await db.from("client_counselors").delete().eq("client_id", clientId);
    if (delError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    if (counselorIds.length > 0) {
      const { error: insError } = await db.from("client_counselors").insert(counselorIds.map((id) => ({ client_id: clientId, counselor_id: id })));
      if (insError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
    }
  }
  return { ok: true };
});
