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

// 動画の長さ（例：1時間5分、12分）
export function formatDuration(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ""}` : `${m}分`;
}

// ランディングページのアクセントカラー（要件 8.6.2）。事前に決めた候補から選ぶ。
// 【仮】候補は暫定（未決事項 No.28）。いずれも白文字とのコントラスト比 4.5 以上。管理側にも同じ定義がある
export const ACCENT_COLORS: Record<string, string> = {
  teal: "#1d6b66",
  blue: "#1f5fa8",
  green: "#2f6b2f",
  purple: "#6a3fa0",
  brown: "#8a4b1f",
  navy: "#2b3f6b",
};

// 終了の理由（利用者向け）。打ち切りとして伝えず、再開できることを必ず添える（要件 3.4.2）。
// 回数そのものは表示しない（要件 3.3.1）。
// 【仮】文面は暫定。自動文面として管理画面から編集できるようにするのは今後（要件 7.14.3、未決事項 No.74）
const closeReasonShort: Record<string, string> = {
  rally: "やり取りが一区切りとなりました",
  manual: "対応が一区切りとなりました",
  user: "ご自身で終了しました",
  idle: "しばらくやり取りがなかったため終了しました",
  expiry: "有効期間が満了しました",
};
export function formatCloseReason(reason: string | null | undefined): string {
  return reason ? closeReasonShort[reason] ?? "終了しました" : "終了しました";
}
const closeReasonLong: Record<string, string> = {
  rally: "今回のご相談のやり取りは、ここで一区切りとなりました。",
  manual: "担当が、今回のご相談への対応を一区切りとしました。",
  user: "このご相談は、ご自身で終了しました。",
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
    signed_out: "ログインの有効期限が切れました。入口からもう一度ログインしてください。",
    invalid_code: "招待コードを確認できませんでした。入力内容をお確かめください。",
    too_many_attempts: "試行回数が上限に達しました。1時間ほどおいてから、もう一度お試しください。",
    not_eligible: "現在、ご相談を開始できません。招待コードの登録状況をご確認ください。",
    consent_required: "ご相談を始めるには、報告についての同意が必要です。",
    survey_incomplete: "まだ選択されていない項目があります。",
    case_already_open: "すでに対応中のご相談があります。",
    case_closed: "このご相談はすでに終了しています。",
    case_open: "対応中のご相談は削除できません。終了したあとに削除できます。",
    not_found: "ご相談が見つかりませんでした。",
    empty_body: "メッセージを入力してください。",
    body_too_long: "メッセージは5000文字以内で入力してください。",
    invalid_email: "メールアドレスの形式をお確かめください。",
    not_applicable: "この操作は、ニックネームで登録された方のためのものです。",
    export_limit: "データの出力は、24時間に3回までです。時間をおいて、もう一度お試しください。",
    nickname_length: "ニックネームは2〜20文字で入力してください。",
    nickname_chars: "ニックネームに、空白や「@」は使えません。",
    nickname_taken: "このニックネームは、すでに使われています。別のニックネームにしてください。",
    password_length: "パスワードは8文字以上（72文字以内）にしてください。",
    weak_password: "このパスワードは使えません。別のパスワードにしてください。",
    too_many_signups: "登録の回数が上限に達しました。1時間ほどおいてから、もう一度お試しください。",
    signup_failed: "登録できませんでした。時間をおいて、もう一度お試しください。",
    inquiry_body: "内容を入力してください（2000文字以内）。",
    inquiry_limit: "問い合わせは、24時間に5件までです。時間をおいて、もう一度お試しください。",
    confirm_mismatch: "確認の文言が一致しません。「退会する」と入力してください。",
    staff_account: "このメールアドレスは運営側（管理画面）のアカウントです。相談者側を使うときは、別のメールアドレスで登録してください。",
    qa_not_found: "この記事は見つかりませんでした。公開が終了した可能性があります。",
    qa_not_eligible: "質問の投稿は、月額会員の方がご利用いただけます。",
    posting_suspended: "現在、質問の投稿をご利用いただけません。お心当たりのない場合は、運営への問い合わせからご連絡ください。",
    quota_exceeded: "今月の投稿は上限（3問）に達しました。個別のご相談は「ご相談」からお受けしています。",
    read_quota_exceeded: "今月、全文を読める本数（3本）を使い切りました。",
    already_reported: "この記事は、すでに通報を受け付けています。",
    full_read_required: "「参考になった」は、全文を読んだコメントにだけ付けられます。",
    report_limit: "通報の回数が上限に達しました。時間をおいて、もう一度お試しください。",
    invalid_resubmit: "この投稿は書き直せません。",
    resubmit_limit: "書き直しの回数が上限に達しました。",
    invalid_genre: "ジャンルを選んでください。",
    question_too_long: "質問は2000文字以内で入力してください。",
    video_not_found: "この動画は見つかりませんでした。",
    invalid_image: "画像は PNG または JPEG のみ送れます。",
    too_many_images: "画像は1通につき3枚までです。",
    image_too_large: "画像が大きすぎます。枚数を減らして、もう一度お試しください。",
    account_deleted: "このアカウントはご利用いただけません。",
  };
  if (message && map[message]) return map[message];
  return "処理に失敗しました。時間をおいて、もう一度お試しください。";
}
