// 管理側アプリ（相談員・運営管理者・クライアント管理サイト暫定含む）
// 技術基盤設計書 1.2 参照：少人数・要MFA。緊急フラグ対応を担うため、相談者側アプリとは別デプロイで被害範囲を分離する。
export default defineNuxtConfig({
  compatibilityDate: "2026-01-01",
  devtools: { enabled: true },

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
