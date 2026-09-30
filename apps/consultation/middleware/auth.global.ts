// 相談者側アプリの画面ガード。
// 公開ページ（トップ・緊急時の案内・ログイン・新規登録など）以外は、ログインが必要。
// 利用者の多要素認証は任意（要件 8.8.4）。設定画面は未実装のため、ここでは検査しない。
//
// ここは画面遷移のためのガードであり、データを守る最終防衛線ではない。
// サーバーAPIは server/utils/auth.ts の requireAccount() で、DBはRLSで、それぞれ独立に検査する。
const PUBLIC = ["/", "/emergency", "/login", "/signup", "/confirm", "/forgot", "/start/invite", "/start/nickname", "/start/email"];
// ログイン済みなら、入口ではなく相談の画面へ進める
const GUEST_ONLY = ["/login", "/signup", "/start/invite", "/start/nickname", "/start/email"];

export default defineNuxtRouteMiddleware(async (to) => {
  // 公開ページのうちサーバー側で生成するもの（トップ・緊急時の案内）は、判定せずに表示する
  if (import.meta.server) return;

  const supabase = useSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const signedIn = Boolean(data.session);

  if (GUEST_ONLY.includes(to.path)) {
    return signedIn ? navigateTo("/consult") : undefined;
  }
  if (PUBLIC.includes(to.path)) return;
  // Q&A の閲覧（投稿を除く）と、クライアント別の入口ページは、ログインしていなくても開ける
  if ((to.path === "/qa" || to.path.startsWith("/qa/")) && to.path !== "/qa/post") return;
  if (to.path.startsWith("/c/")) return;
  if (!signedIn) return navigateTo("/");
});
