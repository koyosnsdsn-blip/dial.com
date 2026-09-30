import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * ブラウザ・SSR双方で使う anon クライアント。
 * RLSに従ってのみアクセスできる。
 *
 * 重要：cases / messages / case_summaries / emergency_records / case_survey_answers への
 * アクセスは、このクライアントを直接使わず、必ず各アプリの server/api/ 経由にすること
 * （技術基盤設計書 3.1、CLAUDE.md 制約#1）。
 */
export function createAnonClient(url: string, anonKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, anonKey);
}

/**
 * サービスロールクライアント。RLSを迂回する。
 *
 * 使用条件（CLAUDE.md 制約#4）：
 * - サーバー側コード（server/api/ 配下）でのみ生成すること
 * - クライアント側バンドルに絶対に含めないこと
 * - SUPABASE_SERVICE_ROLE_KEY は Production 環境変数スコープにのみ設定されている前提
 */
export function createServiceRoleClient(url: string, serviceRoleKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
