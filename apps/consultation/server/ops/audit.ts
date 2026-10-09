// 監査ログ（audit_logs）の記録。要件 7.16：相談内容へのアクセス（管理者による参照を含む）を重点監視対象とする。
//
// 原則（CLAUDE.md 制約#1、技術基盤設計書 3.1）：
//   - 相談内容系テーブル（cases / messages / case_summaries / emergency_records / case_survey_answers）を
//     参照・更新するAPIは、応答を返す「前に」監査ログを記録する
//   - 記録に失敗した場合は、相談内容を返さずにエラーとする（記録のない参照を発生させない）
//   - audit_logs は追記専用（UPDATE・DELETE はDBのトリガで拒否される）
import type { H3Event } from "h3";
import type { StaffContext } from "./auth";
import type { ExpertContext } from "./expert";
import { serviceDb } from "./db";

export type AuditEntry = {
  action: string;            // 例：case.list / case.view / case.urgent.set
  targetType: string;        // 例：cases
  targetId?: string | null;  // 対象の案件IDなど。一覧参照は null
  reason?: string | null;    // 緊急フラグの変更理由など
};

export async function writeAudit(event: H3Event, actor: StaffContext, entry: AuditEntry): Promise<void> {
  await insertAudit(event, "counselor", actor.userId, entry);
}

// 先生（experts）の操作の記録。操作者の種別は expert（未決事項 2.19）
export async function writeExpertAudit(event: H3Event, actor: ExpertContext, entry: AuditEntry): Promise<void> {
  await insertAudit(event, "expert", actor.userId, entry);
}

async function insertAudit(event: H3Event, actorType: "counselor" | "expert", actorId: string, entry: AuditEntry): Promise<void> {
  const { error } = await serviceDb(event).from("audit_logs").insert({
    actor_type: actorType,
    actor_id: actorId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId ?? null,
    reason: entry.reason ?? null,
  });
  if (error) {
    console.error("[audit] failed to write audit log", { action: entry.action, code: error.code });
    throw createError({ statusCode: 500, statusMessage: "audit_log_failed" });
  }
}
