// 通知の受信設定（要件 10.2.2）。任意区分の通知は、種類ごとに止められる。
// 必須区分（パスワードの再設定、ログイン通知、決済に関する通知）は設定の対象にしない。
// 【仮】メール配信サービスが未決のため、通知メールはまだ送っていない。設定だけ先に保存できるようにしている
export const NOTIFICATION_KINDS = [
  { kind: "reply", label: "相談員からのお返事" },
  { kind: "case_closed", label: "ご相談の終了" },
  { kind: "close_notice", label: "ご相談が終了する前のお知らせ" },
  { kind: "qa_result", label: "Q&A の投稿の結果" },
  { kind: "notice", label: "運営からのお知らせ" },
] as const;
