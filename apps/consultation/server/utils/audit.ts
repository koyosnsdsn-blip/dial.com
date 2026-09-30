// 監査ログ（audit_logs）の記録。相談者本人による参照・更新も記録する（CLAUDE.md 制約#1）。
//
//   - 相談内容系テーブルを参照・更新するAPIは、応答を返す「前に」記録する
//   - 記録に失敗した場合は、相談内容を返さずにエラーとする（記録のない参照を発生させない）
//   - 相談内容そのものは記録しない（誰が・いつ・何を・どの案件に、だけを残す）
import type { H3Event } from "h3";
import type { AccountContext } from "./auth";

export type AuditEntry = {
  action: string;            // 例：case.list / case.view / case.start / message.send
  targetType: string;        // 例：cases
  targetId?: string | null;
  reason?: string | null;
};

export async function writeAudit(event: H3Event, actor: AccountContext, entry: AuditEntry): Promise<void> {
  const { error } = await serviceDb(event).from("audit_logs").insert({
    actor_type: "account",
    actor_id: actor.userId,
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
