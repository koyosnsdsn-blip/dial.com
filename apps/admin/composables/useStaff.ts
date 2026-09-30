// ログイン中の相談員・運営管理者の情報（/api/me の結果）を画面間で共有する。
// 判定の正本はサーバー側（server/utils/auth.ts）。ここは表示と画面遷移の判断に使うだけ。
export type Staff = {
  userId: string;
  name: string;
  role: "admin" | "counselor";
};

export const useStaff = () => useState<Staff | null>("staff", () => null);

// /api/me を呼んで相談員情報を取得する。
// 戻り値：Staff＝利用可、"mfa"＝MFA未通過、"forbidden"＝相談員として登録されていない／失効、"signed_out"＝未ログイン
export async function loadStaff(): Promise<Staff | "mfa" | "forbidden" | "signed_out"> {
  const staff = useStaff();
  try {
    staff.value = await $fetch<Staff>("/api/me");
    return staff.value;
  } catch (e: any) {
    staff.value = null;
    const status = e?.statusCode ?? e?.response?.status;
    const message = e?.statusMessage ?? e?.data?.statusMessage;
    if (status === 401 && message === "mfa_required") return "mfa";
    if (status === 403) return "forbidden";
    return "signed_out";
  }
}

export async function signOut() {
  const supabase = useSupabaseClient();
  await supabase.auth.signOut();
  useStaff().value = null;
  usePortalAdmin().value = null;
  await navigateTo("/login");
}

// クライアント管理者（クライアント管理サイト /portal の利用者）。相談員・運営管理者とは別の役割で、/portal 以外には入れない。
export type PortalAdmin = {
  userId: string;
  name: string;
  clientName: string;
  contractType: "corp" | "muni";
  clientStatus: "prep" | "active" | "closed";
  inviteCode: string | null;
  featureConsult: boolean;
};

export const usePortalAdmin = () => useState<PortalAdmin | null>("portal-admin", () => null);

export async function loadPortalAdmin(): Promise<PortalAdmin | null> {
  const state = usePortalAdmin();
  try {
    state.value = await $fetch<PortalAdmin>("/api/portal/me");
  } catch {
    state.value = null;
  }
  return state.value;
}
