// 相談者側アプリ（一般向け・企業会員向け）
// 技術基盤設計書 1.2 参照：公開トラフィックを受ける側。管理側アプリとは別Vercelプロジェクトにデプロイする。
export default defineNuxtConfig({
  compatibilityDate: "2026-01-01",
  devtools: { enabled: true },

  runtimeConfig: {
    // サーバー側のみで参照可能（server/api/ 内）
    // 値はビルド時に埋め込まず、実行時に環境変数 SUPABASE_SERVICE_ROLE_KEY から読む（server/utils/db.ts）。
    // ビルド成果物に秘密鍵を残さないため。Production 環境にのみ設定する（CLAUDE.md 制約#4）
    supabaseServiceRoleKey: "",
    public: {
      // クライアント側にも公開される値。anonキーはRLS前提のため公開可
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    },
  },

  nitro: {
    // Node.jsサーバーレスランタイム（既定）を維持する。
    // 技術基盤設計書 1.3：Edge Runtimeはリージョン固定が効かないため、
    // データを扱うサーバールートでは絶対に指定しないこと。
  },

  typescript: {
    strict: true,
  },
});
