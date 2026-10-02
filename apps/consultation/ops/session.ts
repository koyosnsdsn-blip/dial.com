// 運営側（相談員・運営管理者・クライアント管理者）のログインの有効時間。
// 1つのホストにまとめたため Cookie の有効期限は相談者側（12時間）と共通になった。
// 運営側はそれより短い8時間（【仮】要件 8.8.2「利用者より短く」。正式な値は未決事項 10.4 の確定後に見直す）とし、
// アクセストークンに入っている「最後に認証した時刻」（amr の timestamp）から判定する。トークンを更新しても、この時刻は変わらない。
// サーバー側でも同じ判定をする（server/ops/auth.ts・server/ops/portal.ts）。ここは画面遷移のためだけに使う。
export const STAFF_SESSION_SECONDS = 60 * 60 * 8;

export function lastAuthAt(claims: { amr?: { timestamp?: number }[]; iat?: number } | null | undefined): number | null {
  const times = (claims?.amr ?? []).map((a) => Number(a?.timestamp)).filter((t) => Number.isFinite(t) && t > 0);
  return times.length ? Math.max(...times) : null;
}

export function staffSessionExpired(accessToken: string | null | undefined, now = Date.now()): boolean {
  if (!accessToken) return false;
  try {
    const part = accessToken.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const at = lastAuthAt(JSON.parse(json));
    // 時刻が読めないトークンは、期限切れとして扱う（安全側）
    return at === null || now / 1000 - at > STAFF_SESSION_SECONDS;
  } catch {
    return true;
  }
}
