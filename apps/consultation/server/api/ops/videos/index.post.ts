// 動画の登録（要件 7.7.2）。運営管理者のみ。公開する場合は、視聴できる利用者の確認が必須（7.7.3）
import { writeAudit } from "../../../ops/audit";
import { requireStaff } from "../../../ops/auth";
import { serviceDb } from "../../../ops/db";
import { parseVideoInput, publishState, saveVideoClients, scopeSummary } from "../../../ops/videos";
export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event, { adminOnly: true });
  const body = await readBody<any>(event);
  const input = parseVideoInput(body);
  const state = publishState(body, input);
  const { clientIds, ...row } = input;

  await writeAudit(event, staff, { action: "video.create", targetType: "videos", reason: `${state.status}／${scopeSummary(input, clientIds)}` });
  const { data, error } = await serviceDb(event).from("videos").insert({ ...row, ...state, updated_at: new Date().toISOString() }).select("video_id").single();
  if (error || !data) throw createError({ statusCode: 500, statusMessage: "update_failed" });
  await saveVideoClients(event, data.video_id, clientIds);
  return { videoId: data.video_id as string };
});
