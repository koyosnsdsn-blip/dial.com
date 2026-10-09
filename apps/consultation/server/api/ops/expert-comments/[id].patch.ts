// 先生のコメントの確認・公開管理。相談員・運営管理者。未決事項 2.19（仮：公開前に相談員が確認する）
//   action = publish … 確認待ち→公開。「個人の特定・断定的な診断／法的判断が含まれないことの確認」のチェックが必須（confirmed: true）
//   action = return  … 確認待ち→差し戻し。理由（note、1000文字以内）が必須で、先生に表示する
//   action = hide    … 公開中→非表示。理由（reason）が必須
//   action = restore … 非表示→公開中。理由（reason）が必須
//   action = dismiss … 公開中のまま、未対応の通報を却下する。理由（reason）が必須
//   action = close_reports … 非表示のまま、未対応の通報を対応済みにする。理由（reason）が必須
// 通報への対応は、同じコメントの未対応の通報をまとめて済みにする（非表示にした→hidden、再公開・却下→dismissed）。通報者への通知はしない。
// 公開・差し戻しをした相談員を reviewed_by に記録する（DBのトリガが、確認者のいない公開・差し戻しを拒否する）。
// 監査ログを先に記録し、記録できなければ変更しない。
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { requireText } from "../../../ops/cases";
import { serviceDb } from "../../../ops/db";
import { requireUuid } from "../../../utils/validate";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event);
  const commentId = requireUuid(getRouterParam(event, "id"), "comment_id");
  const input = await readBody<{ action?: unknown; confirmed?: unknown; note?: unknown; reason?: unknown }>(event);
  const action = input?.action;
  if (action !== "publish" && action !== "return" && action !== "hide" && action !== "restore" && action !== "dismiss" && action !== "close_reports") throw createError({ statusCode: 400, statusMessage: "invalid_action" });

  const db = serviceDb(event);
  const { data: current, error } = await db.from("expert_comments").select("comment_id, status").eq("comment_id", commentId).maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!current) throw createError({ statusCode: 404, statusMessage: "not_found" });

  const from = { publish: "pending", return: "pending", hide: "published", restore: "hidden", dismiss: "published", close_reports: "hidden" }[action];
  const to = { publish: "published", return: "returned", hide: "hidden", restore: "published", dismiss: "published", close_reports: "hidden" }[action];
  // 通報の結果（未対応の通報があれば、同時に済みにする）
  const reportResolution = { hide: "hidden", close_reports: "hidden", restore: "dismissed", dismiss: "dismissed" }[action as string] as "hidden" | "dismissed" | undefined;
  if (current.status !== from) throw createError({ statusCode: 409, statusMessage: "comment_not_pending" });

  const patch: Record<string, unknown> = { status: to };
  let auditReason: string | null = null;
  if (action === "publish") {
    if (input.confirmed !== true) throw createError({ statusCode: 400, statusMessage: "checklist_not_confirmed" });
    patch.reviewed_by = staff.userId;
    auditReason = "確認のうえ公開";
  } else if (action === "return") {
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (note.length === 0 || Array.from(note).length > 1000) throw createError({ statusCode: 400, statusMessage: "review_note_required" });
    patch.reviewed_by = staff.userId;
    patch.review_note = note;
    auditReason = note.slice(0, 200);
  } else {
    auditReason = requireText(input.reason, "reason", 500);
    if (action === "restore") patch.reviewed_by = staff.userId;
  }

  await writeAudit(event, staff, { action: `expert_comment.${action}`, targetType: "expert_comments", targetId: commentId, reason: auditReason });

  // 状態が変わる操作だけ、コメントを更新する（却下・通報の終了は、状態はそのまま）
  const { error: updateError } = to === from ? { error: null } : await db.from("expert_comments").update(patch).eq("comment_id", commentId).eq("status", from);
  if (updateError) {
    console.error("[expert_comment] review failed", updateError.code);
    if (/question_not_open|expert_inactive/.test(updateError.message ?? "")) throw createError({ statusCode: 409, statusMessage: "question_not_open" });
    throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  if (reportResolution) {
    const { error: reportError } = await db
      .from("expert_comment_reports")
      .update({ resolution: reportResolution, resolved_at: new Date().toISOString(), resolved_by: staff.userId, resolution_note: auditReason?.slice(0, 500) ?? null })
      .eq("comment_id", commentId)
      .is("resolution", null);
    if (reportError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  }
  return { ok: true, status: to };
});
