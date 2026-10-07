// 画面ガード。
// 運営画面（/ops/…）とクライアント管理サイト（/client-admin/…）は、ops/guard.ts の判定に任せる。
// それ以外（相談者側）は、以下のとおり。
// 公開ページ（トップ・緊急時の案内・ログイン・新規登録など）以外は、ログインが必要。
// 利用者の多要素認証は任意（要件 8.8.4）。設定画面は未実装のため、ここでは検査しない。
//
// ここは画面遷移のためのガードであり、データを守る最終防衛線ではない。
// サーバーAPIは server/utils/auth.ts の requireAccount() で、DBはRLSで、それぞれ独立に検査する。
import { opsGuard } from "../ops/guard";

const PUBLIC = ["/", "/emergency", "/login", "/signup", "/confirm", "/forgot", "/start/invite", "/start/nickname", "/start/email"];
// ログイン済みなら、入口ではなく相談の画面へ進める
const GUEST_ONLY = ["/login", "/signup", "/start/invite", "/start/nickname", "/start/email"];

export default defineNuxtRouteMiddleware(async (to) => {
  // 公開ページのうちサーバー側で生成するもの（トップ・緊急時の案内）は、判定せずに表示する
  if (import.meta.server) return;

  if (isOpsPath(to.path)) return opsGuard(to);

  const supabase = useSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const signedIn = Boolean(data.session);

  if (GUEST_ONLY.includes(to.path)) {
    // ログイン済みでも、相談者として使えるセッションのときだけ相談の画面へ進める
    // （運営側のアカウントや期限切れのセッションのときは、ログイン画面をそのまま見せる）
    if (!signedIn) return;
    return (await checkAccount()) === "ok" ? navigateTo("/consult") : undefined;
  }
  if (PUBLIC.includes(to.path)) return;
  // Q&A の閲覧（投稿を除く）と、クライアント別の入口ページは、ログインしていなくても開ける
  if ((to.path === "/qa" || to.path.startsWith("/qa/")) && to.path !== "/qa/post") return;
  if (to.path.startsWith("/c/")) return;
  // ログインが必要な画面：ログインしていない、または相談者として使えないセッションなら、入口を選ぶトップへ
  if (!signedIn) return navigateTo({ path: "/", query: { reason: "required" } });
  const state = await checkAccount();
  if (state === "signed_out") return navigateTo({ path: "/", query: { reason: "expired" } });
  if (state === "staff") return navigateTo({ path: "/", query: { reason: "staff" } });
});

// 相談者としてのセッションが使えるかを /api/me で確かめる。取得済みなら使い回す（画面遷移のたびに問い合わせない）
//   ok         … 使える
//   signed_out … セッションが無効（期限切れなど）。ブラウザに残ったログイン情報を消す
//   staff      … 運営側（相談員・運営管理者）のアカウントでログインしている
//   error      … 通信の失敗など。判定せず、各画面のエラー表示に任せる
async function checkAccount(): Promise<"ok" | "signed_out" | "staff" | "error"> {
  if (useMe().value) return "ok";
  try {
    await loadMe();
    return "ok";
  } catch (e: any) {
    const status = e?.statusCode ?? e?.response?.status;
    const message = e?.data?.statusMessage ?? e?.statusMessage;
    if (status === 401) {
      await useSupabaseClient().auth.signOut().catch(() => {});
      return "signed_out";
    }
    if (status === 403 && message === "staff_account") return "staff";
    return "error";
  }
}

function isOpsPath(path: string): boolean {
  return path === "/ops" || path.startsWith("/ops/") || path === "/client-admin" || path.startsWith("/client-admin/");
}
