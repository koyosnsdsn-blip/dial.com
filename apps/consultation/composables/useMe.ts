// ログイン中の利用者の状態（/api/me の結果）を画面間で共有する。
// 判定の正本はサーバー側（server/utils/auth.ts）。ここは表示と画面遷移の判断に使うだけ。
export type Me = {
  email: string | null;
  nickname: string | null;
  linked: boolean;
  canConsult: boolean;
  contractType: "corp" | "muni" | null;
  openCaseId: string | null;
  unreadCaseId: string | null;
};

export const useMe = () => useState<Me | null>("me", () => null);

export async function loadMe(): Promise<Me> {
  const me = useMe();
  me.value = await $fetch<Me>("/api/me");
  return me.value;
}

// ログアウト。画面に表示していた相談内容を残さないよう、ページごと読み込み直す（要件 10.4）
export async function signOut() {
  const supabase = useSupabaseClient();
  await supabase.auth.signOut();
  useMe().value = null;
  window.location.assign("/");
}
