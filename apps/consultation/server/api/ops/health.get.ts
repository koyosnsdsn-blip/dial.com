// 動作確認用エンドポイント（技術基盤設計書 1.3：実行リージョンの実測）
// デプロイ後に /api/health を開き、region が "hnd1"（東京）であることを確認する。
// 秘密情報・環境変数の値そのものは返さないこと（設定済みかどうかの真偽値のみ返す）。
export default defineEventHandler(() => {
  const config = useRuntimeConfig();
  return {
    ok: true,
    app: "admin",
    region: process.env.VERCEL_REGION ?? "local",
    env: process.env.VERCEL_ENV ?? "local",
    supabaseConfigured: Boolean(config.public.supabaseUrl && config.public.supabaseAnonKey),
  };
});
