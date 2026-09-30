// 管理側アプリ（相談員・運営管理者・クライアント管理サイト暫定含む）
// 技術基盤設計書 1.2 参照：少人数・要MFA。緊急フラグ対応を担うため、相談者側アプリとは別デプロイで被害範囲を分離する。
export default defineNuxtConfig({
  compatibilityDate: "2026-01-01",
  devtools: { enabled: true },

  // 管理画面は全画面ログイン必須・検索エンジン対象外のため、サーバー側でのHTML生成（SSR）を行わない。
  // 利用者の情報がサーバー生成のHTMLに混入する経路をなくし、認証の判定もブラウザ側の1か所に集約する。
  // サーバーAPI（server/api/）は通常どおり動作し、Cookie のセッションで本人確認する。
  ssr: false,

  modules: ["@nuxtjs/supabase"],

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    // 自動リダイレクトは使わず、MFA（aal2）と相談員判定まで含めた独自のガード（middleware/auth.global.ts）で制御する
    redirect: false,
    types: false,
    cookieOptions: {
      // 暫定値：8時間でセッションCookieを失効させる。
      // 運営側の上限時間は「利用者より短く」（要件 8.8.2）。正式な値は未決事項（10.4）の確定後に見直す
      maxAge: 60 * 60 * 8,
      sameSite: "lax",
      secure: true,
    },
  },

  runtimeConfig: {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    },
  },

  nitro: {
    // Node.jsサーバーレスランタイム（既定）を維持する。Edge Runtimeを指定しないこと。
  },

  typescript: {
    strict: true,
  },
});
