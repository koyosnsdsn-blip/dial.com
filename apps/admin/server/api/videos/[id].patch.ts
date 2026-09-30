// 動画の更新（要件 7.7.2・7.7.3）。運営管理者のみ。
// - 公開中・予約中の動画の配信範囲を変えるとき、公開するときは、視聴できる利用者の確認（confirmed）が必須
// - 配信範囲・公開状態の変更は、変更前後を監査ログに残す
// - publish: "now"（すぐ公開）／"schedule"（予約）／"draft"（下書きに戻す）／指定なし（公開状態は変えない）
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const id = requireUuid(getRouterParam(event, "id"), "video_id");
  const body = await readBody<any>(event);
  const input = parseVideoInput(body);
  const db = serviceDb(event);
  const [{ data: cur, error }, { data: curScopes }] = await Promise.all([
    db.from("videos").select("status, published_at, scope_personal, scope_business").eq("video_id", id).maybeSingle(),
    db.from("video_client_scopes").select("client_id").eq("video_id", id),
  ]);
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  if (!cur) throw createError({ statusCode: 404, statusMessage: "not_found" });

  const curClients = (curScopes ?? []).map((s: any) => s.client_id as string).sort();
  const scopeChanged = cur.scope_personal !== input.scope_personal || cur.scope_business !== input.scope_business || curClients.join() !== [...input.clientIds].sort().join();
  let state: { status: "draft" | "scheduled" | "published"; published_at: string | null };
  if (body?.publish === "now" || body?.publish === "schedule") state = publishState(body, input);
  else if (body?.publish === "draft") state = { status: "draft", published_at: null };
  else {
    state = { status: cur.status, published_at: cur.published_at };
    if (cur.status !== "draft") {
      if (input.scope_personal === "none" && input.scope_business === "none") throw createError({ statusCode: 400, statusMessage: "scope_required" });
      if (scopeChanged && body?.confirmed !== true) throw createError({ statusCode: 400, statusMessage: "audience_not_confirmed" });
    }
  }
  const { clientIds, ...row } = input;
  await writeAudit(event, staff, {
    action: scopeChanged || state.status !== cur.status ? "video.scope.update" : "video.update",
    targetType: "videos",
    targetId: id,
    reason: `${cur.status}→${state.status}／${scopeSummary(cur as any, curClients)} → ${scopeSummary(input, clientIds)}`.slice(0, 2000),
  });
  const { error: updateError } = await db.from("videos").update({ ...row, ...state, updated_at: new Date().toISOString() }).eq("video_id", id);
  if (updateError) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  await saveVideoClients(event, id, clientIds);
  return { ok: true };
});
