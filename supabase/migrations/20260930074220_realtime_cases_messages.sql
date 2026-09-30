-- Supabase Realtime（Postgres Changes）で配信するテーブルを登録する（技術基盤設計書 4章、CLAUDE.md 制約#5）
--   cases    … 緊急フラグ（urgent_flag）の即時通知【必須】、案件の追加・状態変化
--   messages … メッセージの新着反映【望ましい】
-- 配信は RLS に従って絞り込まれる：相談員は担当案件、運営管理者は全案件、いずれも MFA 通過（aal2）が条件。
-- ブラウザ側は変更の通知を受けたら、内容はサーバーAPI経由で取り直す（監査ログを残すため）。
alter publication supabase_realtime add table public.cases;
alter publication supabase_realtime add table public.messages;
