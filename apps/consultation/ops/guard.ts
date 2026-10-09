// 運営画面（/ops/…）とクライアント管理サイト（/client-admin/…）の画面ガード。middleware/auth.global.ts から呼ぶ。
// 2026-10-02 まで別アプリ（apps/admin）だったものを、1つのホストにまとめるために移した。
// 要件 8.8.2：運営側（管理者・相談員）は多要素認証を必須とし、例外を設けない。
//
// 役割ごとにアカウント・ログイン画面を分けている（未決事項 2.13 の③）。
//   運営画面（/ops）               … 相談員・運営管理者。ログインID s-…。/ops/login → /ops/mfa
//   先生の画面（/ops/expert）      … 先生（弁護士・社労士など。未決事項 2.19）。ログインID x-…。/ops/expert-login → /ops/mfa → /ops/expert
//                                     運営画面と同じ認証Cookie（sb-ops-auth-token）を使うため、同じブラウザで相談員と先生が同時にログインすることはできない。
//                                     先生は /ops/expert 以下だけを開ける。相談員・運営管理者は /ops/expert 以下を開けない
//   クライアント管理サイト（/client-admin） … クライアント管理者。ログインID c-…。/client-admin/login → /client-admin/mfa
// ログイン中のアカウントの役割は、Auth 上のメールアドレス（内部用の識別子）の接頭辞で判断する。
//
// 判定の順序（画面の領域ごとに同じ）：
//   1. その領域の役割でログインしていない、またはログインから8時間を過ぎた → その領域のログイン画面
//        （領域ごとにCookieが別なので、相談者側など他の領域のログインは影響しない。万一この領域のCookieに別の役割のセッションがあれば、未ログインと同じ扱い）
//   2. ログイン済みだがMFA未通過（aal1） → その領域のMFA画面（登録済みなら入力、未登録なら登録）
//   3. MFA通過済みだが、相談員／クライアント管理者として無効 → /ops/forbidden（/client-admin/forbidden）
//   4. 運営管理者専用の画面に相談員が来た → /ops
//   5. すべて満たす → 目的の画面へ
//
// /ops/accept-invite（招待リンクからのパスワード設定）はログイン前でも開ける。
// /ops/forbidden と /client-admin/forbidden は、役割を問わずログイン中なら開ける。
//
// ここは画面遷移のためのガードであり、データを守る最終防衛線ではない。
// サーバーAPIは server/ops/auth.ts の requireStaff()・server/ops/portal.ts の requireClientAdmin() で、DBはRLSで、それぞれ独立に同じ条件を検査する。
import type { RouteLocationNormalized } from "vue-router";
import { roleOfLoginEmail } from "../utils/nickname";
import { loadExpert, loadPortalAdmin, loadStaff, useExpert, usePortalAdmin, useStaff } from "./useStaff";
import { staffSessionExpired } from "./session";
import { authClient } from "./authClient";
const ADMIN_ONLY = ["/ops/staff", "/ops/audit", "/ops/clients", "/ops/accounts", "/ops/settings", "/ops/templates", "/ops/notices", "/ops/inquiries", "/ops/deletions", "/ops/genres", "/ops/videos", "/ops/disclosures", "/ops/mail-templates", "/ops/auto-texts", "/ops/reuse-consents", "/ops/ip-rules", "/ops/experts"];

// 先生の領域（/ops/expert と、その下）。/ops/experts（先生の管理。管理者のみ）・/ops/expert-login・/ops/expert-comments（コメントの確認。相談員も行う）は含まない
const isExpertPath = (path: string) => path === "/ops/expert" || path.startsWith("/ops/expert/");

export async function opsGuard(to: RouteLocationNormalized) {
  if (to.path === "/ops/accept-invite") return;

  // 画面の領域（運営画面かクライアント管理サイトか）と、その領域のページ
  const client = to.path === "/client-admin" || to.path.startsWith("/client-admin/");
  const expertPage = !client && (isExpertPath(to.path) || to.path === "/ops/expert-login");
  const area = client
    ? { role: "client_admin" as const, home: "/client-admin", login: "/client-admin/login", mfa: "/client-admin/mfa", forbidden: "/client-admin/forbidden" }
    : { role: "staff" as const, home: "/ops", login: expertPage ? "/ops/expert-login" : "/ops/login", mfa: "/ops/mfa", forbidden: "/ops/forbidden" };

  // 領域ごとに別の認証Cookie（運営画面 sb-ops-auth-token／クライアント管理サイト sb-client-auth-token）を読む。相談者側のログインとは独立
  const supabase = authClient(client ? "client" : "ops");
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const loginRole = session ? roleOfLoginEmail(session.user.email, useRuntimeConfig().public.nicknameDomain as string) : null;

  // 権限がない旨の画面は、役割を問わず、ログイン中なら見せる
  if (to.path === "/ops/forbidden" || to.path === "/client-admin/forbidden") {
    return session ? undefined : navigateTo(area.login);
  }

  // 運営画面では、相談員・運営管理者（staff）と先生（expert）のどちらでも「ログイン中」になりうる。それ以外の役割（相談者、クライアント管理者）は未ログインと同じ扱い
  const isExpert = !client && loginRole === "expert";
  const signedIn = Boolean(session) && (client ? loginRole === "client_admin" : loginRole === "staff" || loginRole === "expert");
  // ログイン画面は、その画面の役割で入る場所（/ops/login は staff、/ops/expert-login は expert）。別の役割でログイン中なら、入り直せるようにフォームを見せる
  const loginPageRole = to.path === "/ops/expert-login" ? "expert" : to.path === "/ops/login" ? "staff" : null;
  const home = isExpert ? "/ops/expert" : area.home;

  // 運営側は、ログインから8時間でログアウトさせる（要件 8.8.2：運営側の上限は利用者より短く）。
  // 1つのホストにまとめたため Cookie の有効期限は相談者側と共通になった。運営側の上限はここと server/ops/auth.ts で別に検査する
  if (signedIn && staffSessionExpired(session!.access_token)) {
    await supabase.auth.signOut();
    useStaff().value = null;
    usePortalAdmin().value = null;
    useExpert().value = null;
    return to.path === area.login ? undefined : navigateTo(area.login);
  }

  if (client ? to.path === area.login : loginPageRole !== null) {
    // その画面の役割でログイン済みなら先へ進める。別の役割でログイン中のときは、フォームを見せる（入り直すと上書きされる）
    return signedIn && (client || loginRole === loginPageRole) ? navigateTo(area.mfa) : undefined;
  }

  if (!signedIn) {
    return navigateTo(area.login);
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const passedMfa = aal?.currentLevel === "aal2";

  if (to.path === area.mfa) {
    return passedMfa ? navigateTo(home) : undefined;
  }

  if (!passedMfa) {
    return navigateTo(area.mfa);
  }

  // クライアント管理サイト：client_admins に有効な本人の行があること（取得済みなら使い回す）
  if (client) {
    if (!usePortalAdmin().value && !(await loadPortalAdmin())) return navigateTo(area.forbidden);
    return;
  }

  // 先生：先生の画面（/ops/expert 以下）だけ開ける。experts に有効な本人の行があること（取得済みなら使い回す）
  if (isExpert) {
    if (!useExpert().value) {
      const result = await loadExpert();
      if (result === "mfa") return navigateTo(area.mfa);
      if (result === "signed_out") return navigateTo("/ops/expert-login");
      if (result === "forbidden") return navigateTo(area.forbidden);
    }
    return isExpertPath(to.path) ? undefined : navigateTo("/ops/expert");
  }

  // 相談員・運営管理者は、先生の画面を開けない
  if (isExpertPath(to.path)) return navigateTo("/ops");

  // 運営画面：相談員判定は画面遷移のたびにサーバーへ問い合わせず、取得済みなら使い回す
  if (!useStaff().value) {
    const result = await loadStaff();
    if (result === "mfa") return navigateTo(area.mfa);
    if (result === "signed_out") return navigateTo(area.login);
    if (result === "forbidden") return navigateTo(area.forbidden);
  }

  if (ADMIN_ONLY.some((p) => to.path.startsWith(p)) && useStaff().value?.role !== "admin") {
    return navigateTo("/ops");
  }
}
