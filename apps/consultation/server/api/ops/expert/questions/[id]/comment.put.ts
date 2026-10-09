// 先生のコメントの保存・提出。未決事項 2.19
//   body   … コメント本文（1〜5000文字）
//   submit … true なら「確認待ち」にして相談員の確認へ回す。false／省略なら下書きとして保存する
// 作成・編集できるのは、担当ジャンルの公開済みの質問で、コメントが「なし・下書き・差し戻し」のとき。
// 確認待ち・公開済み・非表示のコメントは、先生からは変更できない（確認した本文がそのまま公開されるため。DBのトリガでも拒否する）。
// 書き込みは監査ログを先に記録してから行う（記録できなければ書かない）。
import { writeExpertAudit } from "../../../../../ops/audit";
import { requireExpert } from "../../../../../ops/expert";
import { serviceDb, userDb } from "../../../../../ops/db";
import { requireUuid } from "../../../../../utils/validate";
export default defineEventHandler(async (event) => {
  const expert = await requireExpert(event);
  const questionId = requireUuid(getRouterParam(event, "id"), "question_id");
  const input = await readBody<{ body?: unknown; submit?: unknown }>(event);
  const text = typeof input?.body === "string" ? input.body.trim() : "";
  if (text.length === 0 || Array.from(text).length > 5000) throw createError({ statusCode: 400, statusMessage: "body_required" });
  const submit = input?.submit === true;

  // 担当ジャンルの公開済みの質問か（本人の権限で確認する）
  const db = await userDb(event);
  const { data: visible, error } = await db.rpc("expert_visible_questions");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!((visible ?? []) as any[]).some((v) => v.question_id === questionId)) throw createError({ statusCode: 404, statusMessage: "not_found" });

  const { data: current, error: currentError } = await db.from("expert_comments").select("comment_id, status").eq("question_id", questionId).maybeSingle();
  if (currentError) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (current && current.status !== "draft" && current.status !== "returned") throw createError({ statusCode: 409, statusMessage: "comment_locked" });

  await writeExpertAudit(event, expert, {
    action: submit ? "expert_comment.submit" : "expert_comment.save",
    targetType: "expert_comments",
    targetId: (current?.comment_id as string | undefined) ?? null,
    reason: `question_id=${questionId}`,
  });

  const svc = serviceDb(event);
  const status = submit ? "pending" : current?.status === "returned" ? "returned" : "draft";
  if (current) {
    const { error: updateError } = await svc.from("expert_comments").update({ body: text, status }).eq("comment_id", current.comment_id);
    if (updateError) throw mapTriggerError(updateError);
    return { ok: true, status };
  }
  const { error: insertError } = await svc.from("expert_comments").insert({ question_id: questionId, expert_id: expert.userId, body: text, status });
  if (insertError) throw mapTriggerError(insertError);
  return { ok: true, status };
});

// DBのトリガが拒否した理由を、画面向けのコードにする
function mapTriggerError(error: { code?: string; message?: string }) {
  console.error("[expert_comment] write failed", error.code);
  const m = error.message ?? "";
  if (/question_not_open|genre_not_assigned|expert_inactive/.test(m)) return createError({ statusCode: 409, statusMessage: "question_not_open" });
  if (/body_locked|invalid_transition/.test(m)) return createError({ statusCode: 409, statusMessage: "comment_locked" });
  if (error.code === "23505") return createError({ statusCode: 409, statusMessage: "comment_locked" });
  return createError({ statusCode: 500, statusMessage: "update_failed" });
}
