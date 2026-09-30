-- 拡張機能の有効化
-- Supabase の推奨に従い extensions スキーマに入れる（public に入れると Security Advisor が警告する）。
-- extensions スキーマは Supabase の既定 search_path に含まれるため、型名 citext はそのまま使える。
-- gen_random_uuid() は Postgres 13 以降の組み込み関数だが、pgcrypto も明示しておく。
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
