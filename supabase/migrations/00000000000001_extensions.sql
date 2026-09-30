-- 拡張機能の有効化
-- gen_random_uuid() は pgcrypto (Supabase では標準で利用可能だが明示しておく)
create extension if not exists pgcrypto;
create extension if not exists citext;
