// ニックネームでの登録・ログイン（メールアドレスを使わない）
//
// Supabase Auth はメールアドレス（または電話番号）を前提にしているため、ニックネームから
// 「内部用の識別子（メールアドレスの形をした文字列）」を機械的に作り、それを Auth に登録する。
//   - 利用者には見せない。メールの送信にも使わない
//   - ドメインは .invalid（実在しないことが保証された予約済みドメイン）なので、誤って誰かに届くことはない
//   - 同じニックネームからは必ず同じ識別子ができる（ログイン時に同じ計算をする）
// ブラウザとサーバーの両方で使う（Web Crypto を使用）。
export const NICKNAME_DOMAIN = "nick.dial-com.invalid";
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

// 表記ゆれを吸収する（全角・半角、大文字・小文字、前後の空白）
export function normalizeNickname(input: string): string {
  return input.normalize("NFKC").trim().toLowerCase();
}

// 使えるニックネームか。使えない場合は理由のコードを返す
export function nicknameProblem(input: string): "length" | "chars" | null {
  const n = normalizeNickname(input);
  const length = [...n].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return "length";
  // 空白・制御文字・@ は使えない（@ を含む入力はメールアドレスでのログインとして扱うため）
  if (/[\s@\p{Cc}]/u.test(n)) return "chars";
  return null;
}

export async function nicknameToEmail(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeNickname(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `u-${hex.slice(0, 40)}@${NICKNAME_DOMAIN}`;
}

export function isNicknameEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${NICKNAME_DOMAIN}`));
}
