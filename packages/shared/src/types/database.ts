/**
 * このファイルは本来 `supabase gen types typescript --local` で自動生成するもの。
 *
 *   supabase start
 *   supabase gen types typescript --local > packages/shared/src/types/database.ts
 *
 * マイグレーション（/supabase/migrations）を変更したら、このコマンドで再生成し、
 * 手書きの型定義をここに残さないこと。
 *
 * 現時点ではマイグレーション未適用のため、最低限の型でプレースホルダーとしている。
 * Phase 1（DBスキーマ＋RLS）の適用後、必ず上記コマンドで置き換える。
 */
export type Database = {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
    }>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
