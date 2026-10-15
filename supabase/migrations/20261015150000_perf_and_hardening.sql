-- 点検（2026-10-15）の対応：索引の追加、RLS の auth.uid() の評価回数の削減、関数の search_path の固定。
-- 挙動（誰が何を読めるか）は変えない。docs/実装残り・穴の点検_2026-10-15.md の 2-6〜2-8。

-- ===== 1. 索引 =====
-- 案件に紐づくメッセージの取得（相談の画面、RLS の can_read_case、未読の判定）。主キー以外の索引が無かった
create index if not exists ix_messages_case_sent on public.messages (case_id, sent_at);
-- 利用者の案件の一覧（my_cases ビュー。account_id で絞って開始日時の新しい順）
create index if not exists ix_cases_account_opened on public.cases (account_id, opened_at desc);

-- 外部キーに、先頭の列が一致する索引が無いものへ、一括で索引を足す（親の行の削除・更新と、子の行の検索を速くする）。
-- 新しい環境（stg・本番）でも同じ結果になるよう、カタログから求める。すでに足りているものは作らない
do $$
declare
  r record;
  idx text;
begin
  for r in
    select c.conrelid as relid,
           c.conrelid::regclass as tbl,
           (select relname from pg_class where oid = c.conrelid) as relname,
           (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
           (select string_agg(a.attname, '_' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as colname
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
     where c.contype = 'f'
       and n.nspname = 'public'
       and not exists (
         select 1
           from pg_index i
          where i.indrelid = c.conrelid
            and i.indisvalid
            and (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] = c.conkey
       )
  loop
    idx := left('ix_fk_' || r.relname || '_' || r.colname, 63);
    execute format('create index if not exists %I on %s (%s)', idx, r.tbl, r.cols);
  end loop;
end
$$;

-- ===== 2. RLS：auth.uid()／auth.jwt() を (select …) で包む =====
-- 行ごとに関数を呼び直さず、問い合わせごとに1回だけ評価させる（Supabase advisor：auth_rls_initplan）。条件の意味は変えない
alter policy accounts_select_self on public.accounts
  using (account_id = (select auth.uid()));
alter policy client_admins_select_self on public.client_admins
  using (admin_id = (select auth.uid()));
alter policy counselors_select_self_or_admin on public.counselors
  using ((counselor_id = (select auth.uid())) or is_active_admin_counselor());
alter policy cases_select_assigned_or_admin on public.cases
  using ((counselor_id = (select auth.uid())) or is_active_admin_counselor());
alter policy case_summaries_select_counselor_only on public.case_summaries
  using (exists (select 1 from public.cases c where c.case_id = case_summaries.case_id and (c.counselor_id = (select auth.uid()) or is_active_admin_counselor())));
alter policy emergency_records_select_counselor_only on public.emergency_records
  using (exists (select 1 from public.cases c where c.case_id = emergency_records.case_id and (c.counselor_id = (select auth.uid()) or is_active_admin_counselor())));
alter policy experts_select_self_or_staff on public.experts
  using ((expert_id = (select auth.uid())) or is_active_counselor());
alter policy expert_genres_select_self_or_staff on public.expert_genres
  using (((expert_id = (select auth.uid())) and is_active_expert()) or is_active_counselor());
alter policy expert_comments_select_self_or_staff on public.expert_comments
  using (((expert_id = (select auth.uid())) and is_active_expert()) or is_active_counselor());
alter policy client_reports_select_own_client on public.client_quarterly_reports
  using (
    (((select auth.jwt()) ->> 'aal') = 'aal2')
    and exists (select 1 from public.client_admins ca where ca.admin_id = (select auth.uid()) and ca.client_id = client_quarterly_reports.client_id and ca.status = 'active')
  );

-- 運営側（相談員・運営管理者・先生）は MFA 通過後（aal2）でなければ読めない、という制限の方（RESTRICTIVE）
alter policy audit_logs_staff_require_mfa on public.audit_logs
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));
alter policy case_summaries_staff_require_mfa on public.case_summaries
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));
alter policy case_survey_answers_staff_require_mfa on public.case_survey_answers
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));
alter policy cases_staff_require_mfa on public.cases
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));
alter policy counselors_staff_require_mfa on public.counselors
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));
alter policy emergency_records_staff_require_mfa on public.emergency_records
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));
alter policy expert_comments_staff_require_mfa on public.expert_comments
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));
alter policy expert_genres_staff_require_mfa on public.expert_genres
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));
alter policy experts_staff_require_mfa on public.experts
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));
alter policy messages_staff_require_mfa on public.messages
  using ((((select auth.jwt()) ->> 'aal') = 'aal2') or not (select is_active_counselor()));

-- ===== 3. 関数の search_path を固定 =====
-- 本文は引数の列と固定の文字列だけを使うので、空にしてよい（advisor：function_search_path_mutable）
alter function public.qa_is_public(public.questions) set search_path = '';
