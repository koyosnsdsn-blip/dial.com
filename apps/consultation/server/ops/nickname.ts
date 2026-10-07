// 相談者側のニックネーム登録・役割ごとのログインID（utils/nickname.ts）と同じ計算。
// 入力から、Supabase Auth に登録されている内部用の識別子（メールアドレスの形）を求める。
//   u-… 相談者（ニックネーム）／ s-… 相談員・運営管理者（メールアドレス）／ c-… クライアント管理者（メールアドレス）
// 【注意】相談者側の計算方法（正規化・ハッシュ・ドメイン・接頭辞）を変える場合は、こちらも必ず合わせること。
import { createHash } from "node:crypto";
import { LOGIN_PREFIX, type LoginRole, isNicknameEmail, normalizeNickname, roleOfLoginEmail } from "../../utils/nickname";

export { isNicknameEmail, roleOfLoginEmail };
export type { LoginRole };

export function loginIdToEmail(role: LoginRole, input: string, domain: string): string {
  const hex = createHash("sha256").update(normalizeNickname(input), "utf8").digest("hex");
  return `${LOGIN_PREFIX[role]}-${hex.slice(0, 40)}@${domain}`;
}

export function nicknameToEmail(input: string, domain: string): string {
  return loginIdToEmail("user", input, domain);
}
