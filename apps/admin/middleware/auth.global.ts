// 管理側アプリの全画面ガード。
// 要件 8.8.2：運営側（管理者・相談員）は多要素認証を必須とし、例外を設けない。
//
// 判定の順序：
//   1. 未ログイン                     → /login
//   2. ログイン済みだがMFA未通過（aal1） → /mfa（登録済みなら入力、未登録なら登録）
//   3. MFA通過済みだが相談員として無効   → /forbidden
//   4. 運営管理者専用の画面に相談員が来た → /
//   5. すべて満たす                   → 目的の画面へ
//
// /accept-invite（招待メールからのパスワード設定）はログイン前でも開ける。
//
// ここは画面遷移のためのガードであり、データを守る最終防衛線ではない。
// サーバーAPIは server/utils/auth.ts の requireStaff() で、DBはRLSで、それぞれ独立に同じ条件を検査する。
const ADMIN_ONLY = ["/staff", "/audit", "/clients"];

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/accept-invite") return;

  const supabase = useSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const signedIn = Boolean(data.session);

  if (to.path === "/login") {
    return signedIn ? navigateTo("/mfa") : undefined;
  }

  if (!signedIn) {
    return navigateTo("/login");
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const passedMfa = aal?.currentLevel === "aal2";

  if (to.path === "/mfa") {
    return passedMfa ? navigateTo("/") : undefined;
  }

  if (!passedMfa) {
    return navigateTo("/mfa");
  }

  // 相談員判定は画面遷移のたびにサーバーへ問い合わせず、取得済みなら使い回す
  if (!useStaff().value) {
    const result = await loadStaff();
    if (result === "mfa") return navigateTo("/mfa");
    if (result === "signed_out") return navigateTo("/login");
    if (result === "forbidden") {
      return to.path === "/forbidden" ? undefined : navigateTo("/forbidden");
    }
  }

  if (to.path === "/forbidden") {
    return navigateTo("/");
  }

  if (ADMIN_ONLY.some((p) => to.path.startsWith(p)) && useStaff().value?.role !== "admin") {
    return navigateTo("/");
  }
});
