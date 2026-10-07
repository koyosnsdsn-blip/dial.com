// サーバーAPIで使う Supabase クライアントの使い分け（技術基盤設計書 3.1・3.4）
//
//   読む  → userDb(event)    … ログイン中の本人の権限（publishable key＋本人のJWT）。RLS が効く。
//                                サーバー側の実装ミスで他人の案件を読もうとしても、DBが拒否する（多層防御）
//   書く  → serviceDb(event) … service role。RLS を迂回する。ブラウザ（authenticated）には書き込み権限を
//                                一切付与していないため、書き込みと監査ログの記録はこちらでしか行えない
//
// service role を使う前に、必ず requireStaff() で本人確認し、userDb() で対象へのアクセス権を確認すること。
import type { H3Event } from "h3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { areaSupabaseClient } from "./session";

// 運営画面・クライアント管理サイトのAPI専用。リクエストのパスから、読む認証Cookie（運営／クライアント管理）を選ぶ（server/ops/session.ts）
export async function userDb(event: H3Event): Promise<SupabaseClient> {
  return areaSupabaseClient(event);
}

let serviceClient: SupabaseClient | null = null;

export function serviceDb(event: H3Event): SupabaseClient {
  if (serviceClient) return serviceClient;
  const config = useRuntimeConfig(event);
  const url = config.public.supabaseUrl as string | undefined;
  // 実行時の環境変数から読む（ビルド成果物に鍵を埋め込まない）
  const key = (config.supabaseServiceRoleKey as string | undefined) || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // SUPABASE_SERVICE_ROLE_KEY は Production 環境にのみ置く（CLAUDE.md 制約#4）。
    // 未設定の環境では書き込み系・監査ログ記録を伴うAPIは動かない（＝相談内容を返さない）
    throw createError({ statusCode: 503, statusMessage: "service_key_not_configured" });
  }
  serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serviceClient;
}
