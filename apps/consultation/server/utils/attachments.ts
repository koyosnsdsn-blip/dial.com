// 添付画像（要件 3.8）。【仮】保管先は Supabase Storage の非公開バケット（未決事項 No.81）
//
//   - 受け付けるのは PNG / JPEG のみ。拡張子や申告された種類ではなく、ファイルの先頭の並びで判定する
//   - 1通につき3枚まで、合計 4MB まで（Vercel の関数が受け取れる大きさに収めるため。画面側で縮小してから送る）
//   - ブラウザはバケットに直接触れない。保存も取得も、このサーバールート（service role）だけが行う
//   - ファイル名は保存しない（利用者の端末のファイル名に個人情報が含まれ得るため）
import type { H3Event } from "h3";
import { randomUUID } from "node:crypto";

export const ATTACHMENT_BUCKET = "case-attachments";
export const MAX_FILES = 3;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export type IncomingImage = { data: Buffer; mime: "image/png" | "image/jpeg" };

export function sniffImage(data: Buffer): "image/png" | "image/jpeg" | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  return null;
}

// 送信内容を読む。JSON（本文のみ）と multipart（本文＋画像）の両方を受け付ける
export async function readMessageInput(event: H3Event): Promise<{ text: string; images: IncomingImage[] }> {
  const type = getHeader(event, "content-type") ?? "";
  if (!type.startsWith("multipart/form-data")) {
    const body = await readBody<{ body?: unknown }>(event);
    return { text: typeof body?.body === "string" ? body.body.trim() : "", images: [] };
  }
  const parts = (await readMultipartFormData(event)) ?? [];
  let text = "";
  const images: IncomingImage[] = [];
  let total = 0;
  for (const p of parts) {
    if (p.name === "body") text = p.data.toString("utf8").trim();
    if (p.name === "images" && p.data.length > 0) {
      const mime = sniffImage(p.data);
      if (!mime) throw createError({ statusCode: 400, statusMessage: "invalid_image" });
      total += p.data.length;
      images.push({ data: p.data, mime });
    }
  }
  if (images.length > MAX_FILES) throw createError({ statusCode: 400, statusMessage: "too_many_images" });
  if (total > MAX_TOTAL_BYTES) throw createError({ statusCode: 413, statusMessage: "image_too_large" });
  return { text, images };
}

// メッセージの保存後に、画像を保管先へ置いて attachments に記録する。失敗した枚数を返す
export async function storeImages(event: H3Event, caseId: string, messageId: string, images: IncomingImage[]): Promise<number> {
  const db = serviceDb(event);
  let failed = 0;
  for (const img of images) {
    const path = `cases/${caseId}/${messageId}/${randomUUID()}.${img.mime === "image/png" ? "png" : "jpg"}`;
    const { error } = await db.storage.from(ATTACHMENT_BUCKET).upload(path, img.data, { contentType: img.mime, upsert: false });
    if (error) {
      console.error("[attachment] upload failed", error.message);
      failed++;
      continue;
    }
    const { error: rowError } = await db.from("attachments").insert({ message_id: messageId, file_ref: path, mime_type: img.mime, byte_size: img.data.length });
    if (rowError) {
      console.error("[attachment] row insert failed", rowError.code);
      await db.storage.from(ATTACHMENT_BUCKET).remove([path]);
      failed++;
    }
  }
  return failed;
}

// メッセージごとの添付の一覧（識別子だけ。保管先のパスは返さない）
export async function attachmentsOf(event: H3Event, messageIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (messageIds.length === 0) return out;
  const { data, error } = await serviceDb(event).from("attachments").select("attachment_id, message_id").in("message_id", messageIds).order("created_at");
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  for (const a of data ?? []) {
    const list = out.get(a.message_id) ?? [];
    list.push(a.attachment_id);
    out.set(a.message_id, list);
  }
  return out;
}

// 添付の本体を返す。呼び出し側で、案件へのアクセス権の確認と監査ログの記録を済ませておくこと
export async function sendAttachment(event: H3Event, caseId: string, attachmentId: string) {
  const db = serviceDb(event);
  const { data, error } = await db
    .from("attachments")
    .select("file_ref, mime_type, message:messages(case_id, hidden_at)")
    .eq("attachment_id", attachmentId)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: "query_failed" });
  const message = (data as any)?.message;
  if (!data || !message || message.case_id !== caseId || message.hidden_at) throw createError({ statusCode: 404, statusMessage: "not_found" });
  const { data: file, error: fileError } = await db.storage.from(ATTACHMENT_BUCKET).download(data.file_ref);
  if (fileError || !file) throw createError({ statusCode: 404, statusMessage: "not_found" });
  setHeader(event, "Content-Type", data.mime_type === "image/png" ? "image/png" : "image/jpeg");
  setHeader(event, "Cache-Control", "private, no-store");
  setHeader(event, "X-Content-Type-Options", "nosniff");
  setHeader(event, "Content-Disposition", "inline");
  return Buffer.from(await file.arrayBuffer());
}
