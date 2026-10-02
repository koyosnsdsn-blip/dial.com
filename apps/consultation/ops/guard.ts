// 運営画面（/ops/…）とクライアント管理サイト（/client-admin/…）の画面ガード。middleware/auth.global.ts から呼ぶ。
// 2026-10-02 まで別アプリ（apps/admin）だったものを、1つのホストにまとめるために移した。
// 要件 8.8.2：運営側（管理者・相談員）は多要素認証を必須とし、例外を設けない。
//
// 判定の順序：
//   1. 未ログイン、またはログインから8時間を過ぎた → /ops/login
//   2. ログイン済みだがMFA未通過（aal1） → /ops/mfa（登録済みなら入力、未登録なら登録）
//   3. MFA通過済みだが相談員として無効   → クライアント管理者なら /client-admin（それ以外の画面には入れない）、どちらでもなければ /ops/forbidden
//   4. 運営管理者専用の画面に相談員が来た → /ops
//   5. すべて満たす                   → 目的の画面へ
//
// /ops/accept-invite（招待メールからのパスワード設定）はログイン前でも開ける。
//
// ここは画面遷移のためのガードであり、データを守る最終防衛線ではない。
// サーバーAPIは server/ops/auth.ts の requireStaff() で、DBはRLSで、それぞれ独立に同じ条件を検査する。
import type { RouteLocationNormalized } from "vue-router";
import { loadPortalAdmin, loadStaff, usePortalAdmin, useStaff } from "./useStaff";
import { staffSessionExpired } from "./session";
const ADMIN_ONLY = ["/ops/staff", "/ops/audit", "/ops/clients", "/ops/accounts", "/ops/settings", "/ops/templates", "/ops/notices", "/ops/inquiries", "/ops/deletions", "/ops/genres", "/ops/videos", "/ops/disclosures", "/ops/mail-templates", "/ops/auto-texts", "/ops/reuse-consents"];

export async function opsGuard(to: RouteLocationNormalized) {
  if (to.path === "/ops/accept-invite") return;

  const supabase = useSupabaseClient();
  const { data } = await supabase.auth.getSession();
  // 運営側は、ログインから8時間でログアウトさせる（要件 8.8.2：運営側の上限は利用者より短く）。
  // 1つのホストにまとめたため Cookie の有効期限は相談者側と共通になった。運営側の上限はここと server/ops/auth.ts で別に検査する
  if (data.session && staffSessionExpired(data.session.access_token)) {
    await supabase.auth.signOut();
    useStaff().value = null;
    usePortalAdmin().value = null;
    return to.path === "/ops/login" ? undefined : navigateTo("/ops/login");
  }
  const signedIn = Boolean(data.session);

  if (to.path === "/ops/login") {
    return signedIn ? navigateTo("/ops/mfa") : undefined;
  }

  if (!signedIn) {
    return navigateTo("/ops/login");
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const passedMfa = aal?.currentLevel === "aal2";

  if (to.path === "/ops/mfa") {
    return passedMfa ? navigateTo("/ops") : undefined;
  }

  if (!passedMfa) {
    return navigateTo("/ops/mfa");
  }

  // クライアント管理者は、クライアント管理サイト（/client-admin）だけを使える
  if (usePortalAdmin().value) {
    return to.path === "/client-admin" ? undefined : navigateTo("/client-admin");
  }

  // 相談員判定は画面遷移のたびにサーバーへ問い合わせず、取得済みなら使い回す
  if (!useStaff().value) {
    const result = await loadStaff();
    if (result === "mfa") return navigateTo("/ops/mfa");
    if (result === "signed_out") return navigateTo("/ops/login");
    if (result === "forbidden") {
      if (await loadPortalAdmin()) {
        return to.path === "/client-admin" ? undefined : navigateTo("/client-admin");
      }
      return to.path === "/ops/forbidden" ? undefined : navigateTo("/ops/forbidden");
    }
  }

  // ここから先は相談員・運営管理者。クライアント管理サイトは対象外
  if (to.path === "/ops/forbidden" || to.path.startsWith("/client-admin")) {
    return navigateTo("/ops");
  }

  if (ADMIN_ONLY.some((p) => to.path.startsWith(p)) && useStaff().value?.role !== "admin") {
    return navigateTo("/ops");
  }
}
