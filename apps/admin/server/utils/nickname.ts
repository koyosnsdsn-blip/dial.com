// 相談者側のニックネーム登録（apps/consultation/utils/nickname.ts）と同じ計算。
// ニックネームから、Supabase Auth に登録されている内部用の識別子（メールアドレスの形）を求める。
// 【注意】相談者側の計算方法（正規化・ハッシュ・ドメイン）を変える場合は、こちらも必ず合わせること。
import { createHash } from "node:crypto";

export const NICKNAME_DOMAIN = "nick.dial-com.invalid";

export function nicknameToEmail(input: string): string {
  const normalized = input.normalize("NFKC").trim().toLowerCase();
  const hex = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `u-${hex.slice(0, 40)}@${NICKNAME_DOMAIN}`;
}

export function isNicknameEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${NICKNAME_DOMAIN}`));
}
