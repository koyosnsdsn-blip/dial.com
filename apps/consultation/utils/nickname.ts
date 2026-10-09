// ニックネームでの登録・ログイン（メールアドレスを使わない）
//
// Supabase Auth はメールアドレス（または電話番号）を前提にしているため、ニックネームから
// 「内部用の識別子（メールアドレスの形をした文字列）」を機械的に作り、それを Auth に登録する。
//   - 利用者には見せない。メールの送信にも使わない
//   - 同じニックネームからは必ず同じ識別子ができる（ログイン時に同じ計算をする）
// ブラウザとサーバーの両方で使う（Web Crypto を使用）。
//
// ドメインは設定値（runtimeConfig.public.nicknameDomain。環境変数 NICKNAME_DOMAIN）。
//   - Supabase Auth は、.invalid / .test / example.com などの予約済みドメインや、DNSに存在しないドメインを
//     「無効なメールアドレス」として拒否する。そのため、DNSに存在し、かつメールを受け取らないドメインを使う
//   - dev の既定値は相談者側アプリ自身のホスト名（メールサーバーがないので、誤って誰かに届くことはない）
//   - 一度決めたら変えないこと。変えると、それまでに登録した利用者がログインできなくなる
//   - 運営側（server/ops/nickname.ts）と同じ値・同じ計算にすること
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

// ---- 役割ごとのログインID（2026-10-07 追加。未決事項 2.13 の③）----
// 同じメールアドレスでも、役割（相談者／相談員・運営管理者／クライアント管理者）が違えば別のアカウントにするため、
// Supabase Auth に登録する内部用の識別子の先頭に、役割を表す接頭辞を付ける。
//   u-… 相談者（ニックネーム）／ s-… 相談員・運営管理者（メールアドレスから生成）／ c-… クライアント管理者（同）／ x-… 先生（同。2026-10-09 追加。未決事項 2.19）
// 本物のメールアドレスは、相談員は counselors.contact_email、クライアント管理者は client_admins.email に持つ。
// ログイン画面も役割ごとに分ける（/ops/login、/client-admin/login）。同じ計算を server/ops/nickname.ts にも置いている。
// 【暫定】ドメインは NICKNAME_DOMAIN。本番のドメインが決まったら、全員分の識別子を一括で書き換える。
export type LoginRole = "user" | "staff" | "client_admin" | "expert";
export const LOGIN_PREFIX: Record<LoginRole, string> = { user: "u", staff: "s", client_admin: "c", expert: "x" };

// input は、相談者ならニックネーム、相談員・クライアント管理者ならメールアドレス（表記ゆれは normalizeNickname と同じ規則で吸収）
export async function loginIdToEmail(role: LoginRole, input: string, domain: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeNickname(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${LOGIN_PREFIX[role]}-${hex.slice(0, 40)}@${domain}`;
}

// Auth に登録されたメールアドレスから、役割を求める。内部用の識別子でなければ null（メールアドレスで登録した相談者など）
export function roleOfLoginEmail(email: string | null | undefined, domain: string): LoginRole | null {
  if (!email) return null;
  const m = /^([uscx])-[0-9a-f]{40}@(.+)$/.exec(email.toLowerCase());
  if (!m || m[2] !== domain.toLowerCase()) return null;
  return m[1] === "u" ? "user" : m[1] === "s" ? "staff" : m[1] === "c" ? "client_admin" : "expert";
}

export async function nicknameToEmail(input: string, domain: string): Promise<string> {
  return loginIdToEmail("user", input, domain);
}

export function isNicknameEmail(email: string | null | undefined, domain: string): boolean {
  return roleOfLoginEmail(email, domain) === "user";
}
