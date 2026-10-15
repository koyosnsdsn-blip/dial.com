// 招待・パスワード再設定のメール（相談員・運営管理者・先生・クライアント管理者）。
// 以前は、リンクを運営画面に表示して本人に手渡ししていた（暫定）。メール送信（server/ops/mail.ts）ができたので、本人のアドレスへ送る形に戻した。
//
// - Supabase Auth の generateLink はメールを送らず、トークンだけを作る。そのトークンを自前のページ（/ops/accept-invite）のリンクに入れて送る。
// - リンクを開いただけではトークンを使わない。ページの「進む」ボタンを押したときに初めて確認する。
//   メールのセキュリティ製品（リンクの先読み）が、本人より先にトークンを使い切ってしまうのを避けるため。
// - リンクは本人になりすましてパスワードを設定できる情報なので、監査ログ・サーバーのログには残さない。
// - 有効期限は Supabase の設定（メールリンクの有効期限）に従う。本文には時間を書かず、切れたら再送を依頼してもらう。
// - 宛先は、役割ごとの本物のメールアドレス（counselors.contact_email／experts.contact_email／client_admins.email）。Auth 上の内部用の識別子には送らない。
import type { H3Event } from "h3";
import { serviceDb } from "./db";
import { sendMail } from "./mail";

export type SetupKind = "invite" | "reset";
export type SetupArea = "ops" | "client";

// 新しいアカウントを作り、最初のパスワード設定用のトークンを返す
export async function createInviteToken(event: H3Event, loginEmail: string, tag: string): Promise<{ userId: string; tokenHash: string }> {
  const { data, error } = await serviceDb(event).auth.admin.generateLink({ type: "invite", email: loginEmail });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !data?.user || !tokenHash) {
    const msg = error?.message ?? "";
    console.error(`[${tag}] invite token failed`, error?.status, error?.code);
    if (/already|registered|exists/i.test(msg) || error?.code === "email_exists") throw createError({ statusCode: 409, statusMessage: "already_exists" });
    throw createError({ statusCode: 500, statusMessage: "invite_failed" });
  }
  return { userId: data.user.id, tokenHash };
}

// 既存のアカウントに、パスワードを設定し直すトークンを作る（招待の期限切れ・パスワード忘れ）
export async function createResetToken(event: H3Event, userId: string, tag: string): Promise<string> {
  const db = serviceDb(event);
  const { data: user, error: userError } = await db.auth.admin.getUserById(userId);
  const email = user?.user?.email;
  if (userError || !email) throw createError({ statusCode: 404, statusMessage: "not_found" });
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error(`[${tag}] reset token failed`, error?.status, error?.code);
    throw createError({ statusCode: 500, statusMessage: "invite_failed" });
  }
  return tokenHash;
}

function link(event: H3Event, kind: SetupKind, area: SetupArea, tokenHash: string): string {
  const q = new URLSearchParams({ token_hash: tokenHash, type: kind === "invite" ? "invite" : "recovery", area });
  return `${getRequestURL(event).origin}/ops/accept-invite?${q.toString()}`;
}

// 招待・再設定のメールを本人のアドレスへ送る。送れたら true
export async function sendSetupMail(
  event: H3Event,
  o: { kind: SetupKind; to: string; name: string; roleLabel: string; area: SetupArea; tokenHash: string; tag: string },
): Promise<boolean> {
  const url = link(event, o.kind, o.area, o.tokenHash);
  const subject = o.kind === "invite" ? "【ダイヤル.com】アカウント登録のご案内" : "【ダイヤル.com】パスワードの再設定";
  const lead =
    o.kind === "invite"
      ? `ダイヤル.com の${o.roleLabel}アカウントが作成されました。\n下のリンクを開き、ログインに使うパスワードを設定してください。続けて、2段階認証（認証アプリ）の登録に進みます。`
      : `ダイヤル.com の${o.roleLabel}アカウントについて、パスワードの再設定が依頼されました。\n下のリンクを開き、新しいパスワードを設定してください。`;
  const text = [
    `${o.name} 様`,
    "",
    lead,
    "",
    url,
    "",
    "・リンクは1回だけ使えます。有効期限が切れたときは、運営（または所属先の管理者）に再送を依頼してください。",
    "・このメールに心当たりがない場合は、リンクを開かずに破棄してください。",
    "・このメールは送信専用です。返信しても届きません。",
    "",
    "ダイヤル.com 運営",
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.7;color:#222">
<p>${esc(o.name)} 様</p>
<p>${esc(lead).replace(/\n/g, "<br>")}</p>
<p><a href="${esc(url)}" style="display:inline-block;padding:10px 20px;background:#1a5fb4;color:#fff;border-radius:6px;text-decoration:none">パスワードを設定する</a></p>
<p style="font-size:12px;color:#555">ボタンが開けない場合は、次のアドレスをブラウザに貼り付けてください。<br>${esc(url)}</p>
<ul style="font-size:12px;color:#555">
<li>リンクは1回だけ使えます。有効期限が切れたときは、運営（または所属先の管理者）に再送を依頼してください。</li>
<li>このメールに心当たりがない場合は、リンクを開かずに破棄してください。</li>
<li>このメールは送信専用です。返信しても届きません。</li>
</ul>
<p>ダイヤル.com 運営</p></div>`;
  return sendMail({ to: o.to, subject, text, html }, o.tag);
}
