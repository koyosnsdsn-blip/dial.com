-- テーブル権限（GRANT）を明示的に付与する。
--
-- 本プロジェクトは「新しいテーブルを Data API に自動公開しない」設定で作成されており、
-- postgres が作ったテーブルには anon / authenticated / service_role とも SELECT 等の権限が付かない。
-- RLS は「権限がある前提で行を絞る」仕組みのため、GRANT と RLS の両方がそろって初めて読み書きできる。
-- ここでは必要最小限の GRANT だけを付け、見せる範囲は引き続き RLS で絞る。
--
-- service_role（Nuxt の server/api/ が使う。RLS を迂回するが GRANT は必要）：全テーブルの読み書き
-- authenticated（ログイン中のブラウザ）：RLS ポリシーを設計済みのテーブルの SELECT のみ
--   - 相談内容系5テーブルは Supabase Realtime（緊急フラグ等の即時通知）の購読に SELECT 権限が必要なため付与する。
--     通常の参照・更新はサーバールート経由とする方針（CLAUDE.md 制約#1）は変わらない
--   - INSERT / UPDATE / DELETE は一切付与しない（書き込みは必ずサーバールート経由）
-- anon（未ログイン）：付与しない

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 今後 postgres が作成するテーブルにも service_role の権限だけは自動で付ける（ブラウザ向けの権限は都度明示する）
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

grant select on
  cases, messages, case_summaries, emergency_records, case_survey_answers,
  accounts, counselors, client_admins, audit_logs
to authenticated;
