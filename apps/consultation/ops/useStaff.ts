import { authClient } from "./authClient";
import { resetNotifySound } from "./notifySound";

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
    staff.value = await $fetch<Staff>("/api/ops/me");
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

// ログアウト。クライアント管理サイト（/client-admin）からなら /client-admin/login、それ以外は /ops/login へ戻る。
// ログアウトするのは、いま開いている領域のCookieだけ（相談者側や、もう一方の運営側のログインは残る。アカウント自体が別なので、巻き込まない）。
// @click に直接渡されるため引数は取らない（クリックのイベントが入ってくる）
export async function signOut() {
  resetNotifySound();
  const path = useRoute().path;
  const client = path.startsWith("/client-admin");
  // 先生の画面（/ops/expert…）からなら、先生のログイン画面へ戻る
  const expert = path === "/ops/expert" || path.startsWith("/ops/expert/") || path === "/ops/expert-login";
  const loginPath = client ? "/client-admin/login" : expert ? "/ops/expert-login" : "/ops/login";
  await authClient(client ? "client" : "ops").auth.signOut();
  useStaff().value = null;
  usePortalAdmin().value = null;
  useExpert().value = null;
  await navigateTo(loginPath);
}

// クライアント管理者（クライアント管理サイト /client-admin の利用者）。相談員・運営管理者とは別の役割（別のログインID・別のログイン画面）。
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
    state.value = await $fetch<PortalAdmin>("/api/client-admin/me");
  } catch {
    state.value = null;
  }
  return state.value;
}

// 先生（弁護士・社労士・メンタル相談の先生など。運営画面 /ops の中の /ops/expert から使う。未決事項 2.19）
export type Expert = {
  userId: string;
  name: string;
  qualification: string;
  affiliation: string | null;
};

export const useExpert = () => useState<Expert | null>("expert", () => null);

// 戻り値：Expert＝利用可、"mfa"＝MFA未通過、"forbidden"＝先生として登録されていない／停止、"signed_out"＝未ログイン
export async function loadExpert(): Promise<Expert | "mfa" | "forbidden" | "signed_out"> {
  const expert = useExpert();
  try {
    expert.value = await $fetch<Expert>("/api/ops/expert/me");
    return expert.value;
  } catch (e: any) {
    expert.value = null;
    const status = e?.statusCode ?? e?.response?.status;
    const message = e?.statusMessage ?? e?.data?.statusMessage;
    if (status === 401 && message === "mfa_required") return "mfa";
    if (status === 403) return "forbidden";
    return "signed_out";
  }
}
