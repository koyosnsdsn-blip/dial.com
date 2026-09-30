-- 利用者本人が、自分の案件の「担当者の識別子」「往復の消費回数」を直接読めないようにする。
--
-- これまで：cases の SELECT ポリシーに「本人（account_id = auth.uid()）」を含めていたため、利用者が自分の
--   ログイン情報で Data API を直接呼ぶと、cases の全列（counselor_id・rally_used を含む）を読めた。
--   RLS は行単位の制御で、列は絞れないため。
-- 要件：担当者は氏名だけでなく固定的な識別子も利用者に示さない（3.6.1）。対話中に往復の回数を示さない（3.3.1）。
--
-- 変更：
--   1. cases の SELECT ポリシーから「本人」を外す（担当相談員・運営管理者のみ）
--   2. 利用者には、見せてよい列だけを持つビュー my_cases（本人の行のみ）を用意する
--   3. messages・case_survey_answers の「親の案件が見える人」の判定は、cases のポリシーに依存しない関数に置き換える
--      （本人は引き続き自分の案件のメッセージ・回答を読める。Realtime の新着通知も届く）
--
-- 影響：利用者側では cases の変更（相談員による対応完了など）が Realtime で届かなくなる。
--   相談員の返信（messages の追加）は届く。対応完了は、画面に戻ったとき・送信したときにサーバーAPIから取り直して反映する。

-- 案件を読める人か（本人・担当相談員・運営管理者）。ポリシーから使う
create or replace function can_read_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cases c
    where c.case_id = p_case_id
      and (
        c.account_id = auth.uid()
        or c.counselor_id = auth.uid()
        or is_active_admin_counselor()
      )
  );
$$;

revoke execute on function can_read_case(uuid) from public, anon;
grant execute on function can_read_case(uuid) to authenticated;
comment on function can_read_case(uuid) is 'RLSポリシーから使用。SECURITY DEFINERで、cases のポリシー（本人を含まない）に依存せず判定する';

drop policy messages_select_via_case on messages;
create policy messages_select_via_case
  on messages for select
  to authenticated
  using (can_read_case(case_id));

drop policy case_survey_answers_select_via_case on case_survey_answers;
create policy case_survey_answers_select_via_case
  on case_survey_answers for select
  to authenticated
  using (can_read_case(case_id));

drop policy cases_select_own_or_assigned_or_admin on cases;
create policy cases_select_assigned_or_admin
  on cases for select
  to authenticated
  using (
    counselor_id = auth.uid()
    or is_active_admin_counselor()
  );

-- 利用者本人向けの案件ビュー。見せてよい列だけを出す。
--   - 担当者の識別子・往復の回数・緊急フラグ・返信待ちの起点は含めない
--   - 担当の継続性は「前回と同じか」の状態だけを出す（要件 3.6.1）
-- ビューは所有者の権限で cases を読む（security_invoker = false）。行の絞り込みは where 句の auth.uid() で行う。
create view my_cases
with (security_invoker = false)
as
select
  c.case_id,
  c.status,
  c.close_reason,
  c.opened_at,
  c.closed_at,
  c.client_id,
  case
    when c.counselor_id is null or p.prev_counselor_id is null then null
    when c.counselor_id = p.prev_counselor_id then 'same'
    else 'changed'
  end as continuity
from cases c
left join lateral (
  select k.counselor_id as prev_counselor_id
  from cases k
  where k.account_id = c.account_id and k.opened_at < c.opened_at
  order by k.opened_at desc
  limit 1
) p on true
where c.account_id = auth.uid();

comment on view my_cases is '利用者本人の案件（見せてよい列のみ）。相談者側アプリのサーバールートが本人の権限で読む';

revoke all on my_cases from public, anon, authenticated;
grant select on my_cases to authenticated;
grant select on my_cases to service_role;

-- Supabase が用意するイベントトリガ用の関数 rls_auto_enable()（新しいテーブルに自動でRLSを有効化する）。
-- API から呼び出す用途はないため、実行権限を外しておく（セキュリティ診断の警告への対応）。
-- 関数の所有者でない場合は変更できないので、そのときは何もしない。
do $$
begin
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
exception when others then
  raise notice 'rls_auto_enable の権限は変更できませんでした: %', sqlerrm;
end
$$;
