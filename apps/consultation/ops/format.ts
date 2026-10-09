// 表示用の整形（日時はすべて日本時間）
const TZ = "Asia/Tokyo";
const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric", month: "long", day: "numeric", weekday: "short" });
const dayKeyFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTimeFmt.format(new Date(iso));
}
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}
// 日付の区切りを入れるための「日本時間での日付」（YYYY-MM-DD）
export function dayKey(iso: string): string {
  return dayKeyFmt.format(new Date(iso));
}

// 経過時間（例：「3時間前」）
export function formatElapsed(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

// 返信待ちの経過時間（例：「5時間12分」）。SLAタイマーの表示用。
// 起点時刻はサーバーから受け取り、表示の更新はブラウザ側で計算する（CLAUDE.md 制約#6）。
// 期限（残り時間）は SLA の起算方式が未決のため表示しない（未決事項 No.47）。
export function formatWaiting(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}
// 返信待ちが SLA 時間（暦時間換算）の何割に達したか。強調表示の目安にだけ使う
export function waitingRatio(iso: string | null | undefined, slaHours: number, now = Date.now()): number {
  if (!iso || !slaHours) return 0;
  return (now - new Date(iso).getTime()) / (slaHours * 3600 * 1000);
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

const closeReasonLabel: Record<string, string> = {
  rally: "往復回数の上限に到達",
  expiry: "有効期間の満了",
  idle: "無操作による自動終了",
  manual: "相談員による対応完了",
  user: "利用者本人による終了",
};
export function formatCloseReason(reason: string | null | undefined): string {
  return reason ? closeReasonLabel[reason] ?? reason : "—";
}

// APIエラーを画面向けの文言にする
export function apiErrorMessage(e: any): string {
  const message = e?.statusMessage ?? e?.data?.statusMessage;
  const map: Record<string, string> = {
    service_key_not_configured: "サーバーの設定（SUPABASE_SERVICE_ROLE_KEY）が完了していないため表示できません。",
    audit_log_failed: "監査ログを記録できなかったため、処理を中止しました。時間をおいて再度お試しください。",
    not_found: "案件が見つからないか、閲覧の権限がありません。",
    not_assignee: "この操作は担当相談員または運営管理者のみ行えます。",
    admin_only: "この操作は運営管理者のみ行えます。",
    reason_required: "理由を入力してください（500文字以内）。",
    body_required: "本文を入力してください（5000文字以内）。",
    detection_required: "検知した内容を入力してください。",
    name_required: "氏名を入力してください。",
    case_closed: "この案件はすでに終了しています。",
    below_used: "使用済みの往復回数を下回る上限にはできません。",
    invalid_counselor: "選択した相談員は現在有効ではありません。",
    invalid_email: "メールアドレスの形式が正しくありません。",
    already_exists: "このメールアドレスは、この役割ではすでに登録されています（相談員・クライアント管理者・相談者は別々のアカウントのため、他の役割で登録済みでも、ここでは重複になりません）。",
    expired_account: "失効しているアカウントには発行できません。先に再び有効にしてください。",
    email_failed: "招待メールを送信できませんでした。開発環境では、Supabase の組織メンバーのアドレスにしか送信できません。",
    cannot_change_self: "自分自身の権限・状態は変更できません。",
    last_admin: "有効な運営管理者が1人もいなくなるため、変更できません。",
    handover_to_required: "担当中の案件があるため、引継ぎ先を選んでください。",
    invalid_handover: "引継ぎ先に選んだ相談員は有効ではありません。",
    invalid_date: "日付が正しくありません（開始と終了の順序・入力もれを確認してください）。",
    invalid_phone: "電話番号は、数字と「-」「#」などの記号で入力してください。",
    invalid_url: "ウェブサイトは https:// で始まるアドレスを入力してください。",
    title_required: "名前を入力してください（100文字以内）。",
    note_required: "対応のメモを入力してください。",
    invalid_value: "値が範囲外です。",
    range_too_long: "期間が長すぎます。1年以内で指定してください。",
    too_many_rows: "件数が多すぎます（5000件まで）。期間を短くしてください。",
    type_not_confirmed: "契約類型の確認にチェックを入れてください。登録後は変更できません。",
    features_required: "機能をすべて無効にすることはできません。",
    approved_by_required: "この設定には体制側の承認が必要です。承認者を入力してください。",
    client_closed: "このクライアントは契約が終了しているため、変更できません。",
    confirm_name_mismatch: "確認用に入力したクライアント名が一致しません。",
    invite_code_missing: "招待コードが発行されていません。先に招待コードを発行してください。",
    invalid_status: "この状態への変更はできません。",
    question_text_required: "設問文を入力してください（200文字以内）。",
    invalid_options: "選択肢は2〜10個、それぞれ50文字以内で、重複のないように入力してください。",
    checklist_not_confirmed: "禁止事項に当たらないことを確認して、チェックを入れてください。",
    survey_limit: "追加設問は2問までです。追加するには、既存の設問を取り下げてください。",
    qa_not_found: "投稿・記事が見つかりません。すでに処理された可能性があります。",
    not_pending: "この投稿は、すでに処理されています。",
    answer_required: "回答を入力してください。",
    qa_too_long: "文字数が上限を超えています（質問は2000文字、回答は5000文字まで）。",
    invalid_code: "区分を選んでください。",
    invalid_merge_target: "統合先には、公開中の記事を指定してください。",
    invalid_genre: "ジャンルを選んでください。",
    question_required: "質問文を入力してください（2000文字以内）。",
    reuse_not_agreed: "素材にする相談について、二次利用の同意が済んでいません。",
    reuse_already_requested: "この相談には、すでに同意を依頼しています。",
    case_open: "対応中の相談には依頼できません。終了してから依頼してください。",
    case_deleted: "利用者が削除した相談には依頼できません。",
    invalid_move_to: "記事があるジャンルを削除するには、移行先のジャンルを選んでください。",
    invalid_source: "動画のアドレスは、Vimeo または YouTube の埋め込み用アドレス（https://player.vimeo.com/video/… など）を入力してください。",
    invalid_scope: "配信範囲を選んでください。",
    clients_required: "「選択したクライアントのみ」のときは、対象のクライアントを1社以上選んでください。",
    scope_required: "個人利用者・企業会員の両方が「対象外」の動画は、公開できません。",
    source_required: "動画のアドレスが未入力のため、公開できません。",
    audience_not_confirmed: "視聴できる利用者を確認して、チェックを入れてください。",
    landing_too_long: "掲載コメントは600文字、連絡先は300文字までです。",
    not_verified: "本人確認が済んでいません。先に本人確認の完了を記録してください。",
    already_completed: "この請求は、すでに回答済みです。",
    subject_required: "件名を入力してください（100文字以内）。",
    auto_text_too_long: "文面は500文字以内で入力してください。",
    auto_text_var_missing: "この文面には、決められた差込項目（例：{返信までの時間}）を入れてください。",
    auto_text_fixed_time: "受付の自動応答には、「24時間」のような固定の時間を書けません。{返信までの時間} を使ってください。",
    invalid_image: "画像は PNG または JPEG のみ送れます。",
    too_many_images: "画像は1通につき3枚までです。",
    image_too_large: "画像が大きすぎます。枚数を減らしてください。",
    member_account: "企業会員のアカウントは、会員区分を切り替えられません。",
    invalid_cidr: "IPアドレスの形式が正しくありません。例：203.0.113.5、203.0.113.0/24。範囲で指定する場合は、末尾を0にしてください（192.168.1.1/24 ではなく 192.168.1.0/24）。",
    invalid_note: "メモは200文字以内で入力してください。",
    self_block: "いまお使いの接続元が含まれるため、拒否リストに登録できません（ご自身が締め出されます）。",
    range_too_wide: "範囲が広すぎるため登録できません（IPv4 は /8、IPv6 は /16 より狭い範囲にしてください）。",
    already_registered: "この値は、すでに登録されています。",
    too_many_items: "一度に登録できるのは50件までです。分けて登録してください。",
    too_many_rules: "登録できる件数の上限に達しています。",
    ip_not_allowed: "許可されていない接続元からのアクセスです。",
    last_client_admin: "有効なクライアント管理者が1人もいなくなるため、変更できません。",
    report_not_available: "準備中のクライアントには、レポートを作成できません。",
    not_client_admin: "このアカウントでは、クライアント管理サイトを利用できません。",
    display_name_required: "表示名を入力してください（50文字以内）。",
    qualification_required: "資格・肩書を入力してください（50文字以内）。",
    genres_required: "担当ジャンルを1つ以上選んでください。",
    invalid_affiliation: "所属は100文字以内で入力してください。",
    invalid_bio: "紹介文は1000文字以内で入力してください。",
    comment_locked: "このコメントは、すでに提出・公開されているため、変更できません。",
    question_not_open: "この質問には、現在コメントできません（非公開になったか、担当ジャンルが変更された可能性があります）。",
    comment_not_pending: "このコメントは、すでに確認済みです。",
    review_note_required: "差し戻しの理由を入力してください（1000文字以内）。",
    invalid_action: "操作が正しくありません。",
    not_expert: "このアカウントでは、先生用の画面を利用できません。",
    survey_retired: "この設問はすでに取り下げられています。",
  };
  if (message && map[message]) return map[message];
  if (typeof message === "string" && message.startsWith("invalid_")) return "入力内容が正しくありません。";
  return "処理に失敗しました。時間をおいて再度お試しください。";
}

// 四半期の表示（例：2026-07-01 → 2026年7〜9月）
export function quarterLabel(start: string): string {
  const [y, m] = start.split("-").map(Number);
  return `${y}年${m}〜${m + 2}月`;
}
