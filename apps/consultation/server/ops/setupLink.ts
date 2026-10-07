// 【暫定】招待・再設定のリンクを、メールで送らずに画面へ表示するための処理。
// メール送信の仕組み（未決事項 No.59）が入るまでのつなぎ。入ったら、ここで作ったリンクをメールで送る形に置き換え、画面への表示はやめる。
//
// - Supabase Auth の generateLink は、リンクを作るだけでメールを送らない。
// - リンクは1回限り。有効時間は Supabase の設定（メールリンクの有効期限。既定は1時間）に従う。
// - リンクは、本人になりすましてパスワードを設定できる情報なので、監査ログ・サーバーのログには残さない。
//   画面に表示した操作だけを監査ログに残す（呼び出し側）。応答はキャッシュさせない。
// - 戻り先は /ops/accept-invite（パスワードを設定し、2段階認証の登録へ進む）。
//   すでに2段階認証を登録している人が再設定リンクを使っても、ログインには本人の認証アプリのコードが要る。
import type { H3Event } from "h3";
import { serviceDb } from "./db";

export const SETUP_LINK_NOTE = "リンクは1回だけ使えます。有効期限は発行から1時間（Supabase の既定）です。";

function redirectTo(event: H3Event): string {
  return `${getRequestURL(event).origin}/ops/accept-invite`;
}

function noStore(event: H3Event) {
  setResponseHeader(event, "Cache-Control", "no-store");
}

// 新しいアカウントを作り、最初のパスワード設定用のリンクを返す
export async function createInviteLink(event: H3Event, email: string, tag: string): Promise<{ userId: string; link: string }> {
  const { data, error } = await serviceDb(event).auth.admin.generateLink({ type: "invite", email, options: { redirectTo: redirectTo(event) } });
  const link = data?.properties?.action_link;
  if (error || !data?.user || !link) {
    const msg = error?.message ?? "";
    console.error(`[${tag}] invite link failed`, error?.status, error?.code);
    if (/already|registered|exists/i.test(msg) || error?.code === "email_exists") throw createError({ statusCode: 409, statusMessage: "already_exists" });
    throw createError({ statusCode: 500, statusMessage: "invite_failed" });
  }
  noStore(event);
  return { userId: data.user.id, link };
}

// 既存のアカウントに、パスワードを設定し直すリンクを作る（招待リンクの期限切れ・パスワード忘れ）
export async function createResetLink(event: H3Event, userId: string, tag: string): Promise<string> {
  const db = serviceDb(event);
  const { data: user, error: userError } = await db.auth.admin.getUserById(userId);
  const email = user?.user?.email;
  if (userError || !email) throw createError({ statusCode: 404, statusMessage: "not_found" });
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: redirectTo(event) } });
  const link = data?.properties?.action_link;
  if (error || !link) {
    console.error(`[${tag}] reset link failed`, error?.status, error?.code);
    throw createError({ statusCode: 500, statusMessage: "invite_failed" });
  }
  noStore(event);
  return link;
}
