-- RLSポリシー
--
-- 方針（技術基盤設計書 v1.1 §3.1・§3.2、CLAUDE.md 制約#1・#2）：
-- - cases / messages / case_summaries / emergency_records / case_survey_answers は
--   「サーバールート経由のみ」が原則。通常のCRUDはservice roleキー（RLSを迂回する）を
--   使うNuxtのserver/api/からのみ行う。
-- - ただし Supabase Realtime（Postgres Changes）は anon/authenticated ロールの
--   ブラウザから直接購読する設計（技術基盤設計書 4章：urgent_flagの必須リアルタイム通知）。
--   Realtimeの配信はRLSに従って絞り込まれるため、この5テーブルにSELECTポリシーを
--   明示しておかないと「SELECT権限を持つロール全員に配信」されてしまう。
-- - そのため、この5テーブルには「正しく絞り込まれたSELECTポリシー」のみを設定し、
--   INSERT/UPDATE/DELETEのポリシーは設定しない（＝anon/authenticatedからの直接書き込みは
--   常に拒否され、書き込みは必ずservice role経由のサーバールートで行うことになる）。
-- - client_admins に紐づくロールは、この5テーブルへのSELECTポリシーを一切持たない
--   （技術基盤設計書 §2.3：事前集計済みビューのみ参照可能とする方針）。

-- ============================================================
-- ヘルパー関数
-- ============================================================

create or replace function is_active_counselor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from counselors
    where counselor_id = auth.uid() and status = 'active'
  );
$$;

create or replace function is_active_admin_counselor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from counselors
    where counselor_id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;

-- 未ログイン（anon）からRPCとして呼ばれないようにする。RLSポリシーは authenticated のみ対象なので実行権限はそれで足りる
revoke execute on function is_active_counselor() from public, anon;
revoke execute on function is_active_admin_counselor() from public, anon;
grant execute on function is_active_counselor() to authenticated;
grant execute on function is_active_admin_counselor() to authenticated;

comment on function is_active_counselor() is 'RLSポリシーから使用。SECURITY DEFINERでcounselorsテーブル自体のRLSと循環しないようにする';
comment on function is_active_admin_counselor() is '同上。role=adminは全案件を閲覧できる（運営管理者）';

-- ============================================================
-- cases：必須リアルタイム対象（urgent_flag）
-- ============================================================

alter table cases enable row level security;

create policy cases_select_own_or_assigned_or_admin
  on cases for select
  to authenticated
  using (
    account_id = auth.uid()
    or counselor_id = auth.uid()
    or is_active_admin_counselor()
  );

-- ============================================================
-- messages
-- ============================================================

alter table messages enable row level security;

create policy messages_select_via_case
  on messages for select
  to authenticated
  using (
    exists (
      select 1 from cases c
      where c.case_id = messages.case_id
        and (
          c.account_id = auth.uid()
          or c.counselor_id = auth.uid()
          or is_active_admin_counselor()
        )
    )
  );

-- ============================================================
-- case_summaries（相談員によるレビュー対象。利用者には見せない）
-- ============================================================

alter table case_summaries enable row level security;

create policy case_summaries_select_counselor_only
  on case_summaries for select
  to authenticated
  using (
    exists (
      select 1 from cases c
      where c.case_id = case_summaries.case_id
        and (c.counselor_id = auth.uid() or is_active_admin_counselor())
    )
  );

-- ============================================================
-- emergency_records（相談員・運営管理者のみ）
-- ============================================================

alter table emergency_records enable row level security;

create policy emergency_records_select_counselor_only
  on emergency_records for select
  to authenticated
  using (
    exists (
      select 1 from cases c
      where c.case_id = emergency_records.case_id
        and (c.counselor_id = auth.uid() or is_active_admin_counselor())
    )
  );

-- ============================================================
-- case_survey_answers
-- ============================================================

alter table case_survey_answers enable row level security;

create policy case_survey_answers_select_via_case
  on case_survey_answers for select
  to authenticated
  using (
    exists (
      select 1 from cases c
      where c.case_id = case_survey_answers.case_id
        and (
          c.account_id = auth.uid()
          or c.counselor_id = auth.uid()
          or is_active_admin_counselor()
        )
    )
  );

-- ============================================================
-- accounts / counselors / client_admins：本人の行のみ参照可
-- ============================================================

alter table accounts enable row level security;

create policy accounts_select_self
  on accounts for select
  to authenticated
  using (account_id = auth.uid());

alter table counselors enable row level security;

create policy counselors_select_self_or_admin
  on counselors for select
  to authenticated
  using (counselor_id = auth.uid() or is_active_admin_counselor());

alter table client_admins enable row level security;

create policy client_admins_select_self
  on client_admins for select
  to authenticated
  using (admin_id = auth.uid());

-- ============================================================
-- audit_logs：INSERTのみ許可（サーバールートからservice role経由が基本だが、
-- 将来クライアント側からの直接記録を許す場合に備え、UPDATE/DELETEポリシーは
-- 設定しない＝常に拒否のままとする。SELECTも運営管理者のみ）
-- ============================================================

alter table audit_logs enable row level security;

create policy audit_logs_select_admin_only
  on audit_logs for select
  to authenticated
  using (is_active_admin_counselor());

-- ============================================================
-- 上記以外の全テーブル：RLSを有効化し、ポリシーは付与しない（＝anon/authenticatedからは全拒否）
--
-- 注意：Supabase では public スキーマのテーブルに anon/authenticated への権限が既定で付与される。
-- RLSを有効化しないと publishable(anon) key だけで読み書きできてしまうため、
-- 「ポリシー未設計のテーブルも必ず RLS 有効化だけはしておく」こと。
-- service role（Nuxt の server/api/）は RLS を迂回するので、現時点の実装方針（サーバールート経由）には影響しない。
--
-- TODO（次フェーズ）：実装が進み次第、以下に個別の SELECT ポリシーを設計する。
--   - questions / answers（公開済みのみ匿名でも読めるようにする想定。account_id は返さないビュー経由）
--   - genres / videos / notices（公開情報。読み取り公開ポリシーを検討）
--   - entitlements / payments / subscriptions（本人のみ参照）
--   - survey_questions / survey_options / account_attributes
--   - clients / landing_pages / client_counselors
-- ============================================================

-- 契約・アカウント
alter table clients               enable row level security;
alter table landing_pages         enable row level security;
alter table client_counselors     enable row level security;
alter table consents              enable row level security;
alter table sessions              enable row level security;
alter table notification_settings enable row level security;

-- 機能1（Q&A）
alter table genres                enable row level security;
alter table questions             enable row level security;
alter table answers               enable row level security;
alter table question_actions      enable row level security;
alter table anonymization_edits   enable row level security;
alter table reports               enable row level security;
alter table post_quotas           enable row level security;

-- 機能2（相談）のうち上で扱っていないもの
alter table entitlements          enable row level security;
alter table attachments           enable row level security;
alter table rally_adjustments     enable row level security;

-- アンケート
alter table survey_questions      enable row level security;
alter table survey_options        enable row level security;
alter table account_attributes    enable row level security;

-- 機能3（動画）
alter table videos                enable row level security;
alter table video_client_scopes   enable row level security;
alter table video_views           enable row level security;

-- 決済
alter table payments              enable row level security;
alter table subscriptions         enable row level security;

-- 運営・権利行使
alter table deletion_requests     enable row level security;
alter table disclosure_requests   enable row level security;
alter table reuse_consents        enable row level security;
alter table mail_templates        enable row level security;
alter table notices               enable row level security;
alter table system_settings       enable row level security;
