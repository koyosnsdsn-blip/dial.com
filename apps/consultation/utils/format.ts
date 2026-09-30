// 表示用の整形（日時はすべて日本時間）
const TZ = "Asia/Tokyo";
const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric", month: "long", day: "numeric", weekday: "short" });
const shortDateFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" });
const dayKeyFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}
export function formatShortDate(iso: string | null | undefined): string {
  return iso ? shortDateFmt.format(new Date(iso)) : "—";
}
// 日付の区切りを入れるための「日本時間での日付」（YYYY-MM-DD）
export function dayKey(iso: string): string {
  return dayKeyFmt.format(new Date(iso));
}

// 終了の理由（利用者向け）。打ち切りとして伝えず、再開できることを必ず添える（要件 3.4.2）。
// 回数そのものは表示しない（要件 3.3.1）。
// 【仮】文面は暫定。自動文面として管理画面から編集できるようにするのは今後（要件 7.14.3、未決事項 No.74）
const closeReasonShort: Record<string, string> = {
  rally: "やり取りが一区切りとなりました",
  manual: "対応が一区切りとなりました",
  idle: "しばらくやり取りがなかったため終了しました",
  expiry: "有効期間が満了しました",
};
export function formatCloseReason(reason: string | null | undefined): string {
  return reason ? closeReasonShort[reason] ?? "終了しました" : "終了しました";
}
const closeReasonLong: Record<string, string> = {
  rally: "今回のご相談のやり取りは、ここで一区切りとなりました。",
  manual: "担当が、今回のご相談への対応を一区切りとしました。",
  idle: "しばらくやり取りがなかったため、このご相談は終了しました。",
  expiry: "有効期間が満了したため、このご相談は終了しました。",
};
export function closeReasonMessage(reason: string | null | undefined): string {
  return reason ? closeReasonLong[reason] ?? "このご相談は終了しました。" : "このご相談は終了しました。";
}

// APIエラーを画面向けの文言にする
export function apiErrorMessage(e: any): string {
  const message = e?.statusMessage ?? e?.data?.statusMessage;
  const map: Record<string, string> = {
    service_key_not_configured: "ただいま準備中のため、この機能はご利用いただけません。（サーバーの設定が完了していません）",
    audit_log_failed: "処理を完了できませんでした。時間をおいて、もう一度お試しください。",
    signed_out: "ログインの有効期限が切れました。もう一度ログインしてください。",
    invalid_code: "招待コードを確認できませんでした。入力内容をお確かめください。",
    too_many_attempts: "試行回数が上限に達しました。1時間ほどおいてから、もう一度お試しください。",
    not_eligible: "現在、ご相談を開始できません。招待コードの登録状況をご確認ください。",
    consent_required: "ご相談を始めるには、報告についての同意が必要です。",
    survey_incomplete: "まだ選択されていない項目があります。",
    case_already_open: "すでに対応中のご相談があります。",
    case_closed: "このご相談はすでに終了しています。",
    not_found: "ご相談が見つかりませんでした。",
    empty_body: "メッセージを入力してください。",
    body_too_long: "メッセージは5000文字以内で入力してください。",
    export_limit: "データの出力は、24時間に3回までです。時間をおいて、もう一度お試しください。",
    account_deleted: "このアカウントはご利用いただけません。",
  };
  if (message && map[message]) return map[message];
  return "処理に失敗しました。時間をおいて、もう一度お試しください。";
}
