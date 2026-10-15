// メール送信（AWS SES の SMTP）。未決事項 2.23（送信ドメイン app.dsn.co.jp、SES）。
// 設定は環境変数（Vercel の dial.com-op-dev）から実行時に読む。値をビルド成果物に残さない。
//   SMTP_HOST … 例 email-smtp.ap-northeast-1.amazonaws.com
//   SMTP_PORT … 587（STARTTLS）。465 のときは TLS 直結
//   SMTP_USER / SMTP_PASS … SES の SMTP 認証情報（IAM ユーザーのもの。SMTP パスワードであり、IAM のシークレットキーそのものではない）
//   MAIL_FROM … 差出人のアドレス（SES で検証済みのドメイン app.dsn.co.jp のもの）。例 dialdotcom-info@app.dsn.co.jp
//   MAIL_FROM_NAME … 差出人の表示名（省略時「ダイヤル.com」）
// 設定が欠けているときは送信せず false を返す（呼び出し側が「送れなかった」を画面に出す）。メールの本文やリンクはログに残さない。
import nodemailer from "nodemailer";

export type MailMessage = { to: string; subject: string; text: string; html?: string };

export function mailConfigured(): boolean {
  const e = process.env;
  return Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS && e.MAIL_FROM);
}

// 送れたら true。設定が無い・SMTP が拒否したときは false（理由は種別だけをログに残す）
export async function sendMail(msg: MailMessage, tag: string): Promise<boolean> {
  if (!mailConfigured()) {
    console.error(`[mail:${tag}] SMTP settings are missing`);
    return false;
  }
  const e = process.env;
  const port = Number(e.SMTP_PORT || 587);
  try {
    const transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({
      from: { name: e.MAIL_FROM_NAME || "ダイヤル.com", address: e.MAIL_FROM as string },
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return true;
  } catch (error: any) {
    console.error(`[mail:${tag}] send failed`, error?.code, error?.responseCode);
    return false;
  }
}

// 画面や監査ログに出すための、一部を伏せたアドレス（例 i***@dsn.co.jp）
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
