-- 相談員・運営管理者は MFA を通過したセッション（JWT の aal = 'aal2'）でのみ、
-- 相談内容系テーブル・運営系テーブルを参照できるようにする（要件 8.8.2：運営側は多要素認証必須・例外なし）。
--
-- restrictive ポリシーは既存の permissive ポリシー（本人・担当・管理者の判定）に「かつ」で加わる。
-- 相談員でない利用者（accounts）はこの条件の対象外（利用者の MFA は任意：要件 8.8.4）。
-- Realtime の配信も RLS に従うため、aal1 の相談員には緊急フラグ等の変更も配信されない。
-- 画面のガード（middleware/auth.global.ts）・サーバーAPI（server/utils/auth.ts）に続く、DB層の多層防御。

create policy cases_staff_require_mfa
  on cases as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));

create policy messages_staff_require_mfa
  on messages as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));

create policy case_summaries_staff_require_mfa
  on case_summaries as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));

create policy emergency_records_staff_require_mfa
  on emergency_records as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));

create policy case_survey_answers_staff_require_mfa
  on case_survey_answers as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));

create policy counselors_staff_require_mfa
  on counselors as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));

create policy audit_logs_staff_require_mfa
  on audit_logs as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));
