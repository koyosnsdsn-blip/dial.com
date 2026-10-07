// ログインが必要な画面から入口へ戻したときの案内（middleware/auth.global.ts が ?reason= を付ける）
const REASONS: Record<string, string> = {
  required: "このページを見るには、ログインが必要です。登録した入口を選んで、ログインしてください。",
  expired: "ログインの有効期限が切れました。登録した入口を選んで、もう一度ログインしてください。",
  staff: "いまは運営側のアカウントでログインしています。相談者としてログインすると、このブラウザの運営画面からはログアウトされます。運営画面と相談者側を同時に使うときは、別のブラウザかシークレットウィンドウで開いてください。",
};

export function loginReasonMessage(reason: unknown): string {
  return typeof reason === "string" ? REASONS[reason] ?? "" : "";
}
