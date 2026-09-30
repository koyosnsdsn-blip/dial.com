// 表示用の日時整形（日本時間）
const dateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTime.format(new Date(iso));
}

// 経過時間（例：「3時間前」）。SLA表示の正式版ではない（SLAは起点時刻からクライアント側で計算：CLAUDE.md 制約#6）
export function formatElapsed(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

// APIエラーを画面向けの文言にする
export function apiErrorMessage(e: any): string {
  const message = e?.statusMessage ?? e?.data?.statusMessage;
  if (message === "service_key_not_configured") {
    return "サーバーの設定（SUPABASE_SERVICE_ROLE_KEY）が完了していないため表示できません。";
  }
  if (message === "audit_log_failed") {
    return "監査ログを記録できなかったため、表示を中止しました。時間をおいて再度お試しください。";
  }
  if (message === "not_found") return "案件が見つからないか、閲覧の権限がありません。";
  if (message === "reason_required") return "理由を入力してください（500文字以内）。";
  return "読み込みに失敗しました。時間をおいて再度お試しください。";
}
