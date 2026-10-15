-- テストフラグの補足（2026-10-15）
-- テストのクライアントに所属するアカウントは、そのアカウント自身にフラグがなくてもテストとして扱う。
-- （企業会員の「個人の無料相談」の案件は cases.client_id が空のため、案件のクライアントだけを見ると漏れる）
--   アカウントがテスト ＝ accounts.is_test が true、または所属クライアント（accounts.client_id）がテスト
--   案件がテスト       ＝ 案件のクライアント（cases.client_id）がテスト、または アカウントがテスト（上記）
-- クライアントのフラグを変えたとき・アカウントの所属が変わったときも、既存の案件に反映する。

create or replace function public.case_is_test_for(p_client uuid, p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.is_test from public.clients c where c.client_id = p_client), false)
      or coalesce((select a.is_test or coalesce(c.is_test, false)
                     from public.accounts a left join public.clients c on c.client_id = a.client_id
                    where a.account_id = p_account), false);
$$;

create or replace function public.set_case_is_test()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_test := public.case_is_test_for(new.client_id, new.account_id);
  return new;
end;
$$;

-- クライアントのフラグが変わった：そのクライアントの案件と、所属アカウントの案件を取り直す
create or replace function public.propagate_client_is_test()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cases c
     set is_test = public.case_is_test_for(c.client_id, c.account_id)
   where (c.client_id = new.client_id
          or c.account_id in (select a.account_id from public.accounts a where a.client_id = new.client_id))
     and c.is_test is distinct from public.case_is_test_for(c.client_id, c.account_id);
  return new;
end;
$$;

-- アカウントのフラグ・所属が変わった：そのアカウントの案件を取り直す
create or replace function public.propagate_account_is_test()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cases c
     set is_test = public.case_is_test_for(c.client_id, c.account_id)
   where c.account_id = new.account_id
     and c.is_test is distinct from public.case_is_test_for(c.client_id, c.account_id);
  return new;
end;
$$;

create or replace trigger trg_propagate_account_is_test
  after update of is_test, client_id on public.accounts
  for each row when (old.is_test is distinct from new.is_test or old.client_id is distinct from new.client_id)
  execute function public.propagate_account_is_test();

revoke all on function public.case_is_test_for(uuid, uuid) from public, anon, authenticated;

-- 監査ログの判定も、アカウントは所属クライアントを含めて見る
create or replace function private.audit_is_test(p_actor_type text, p_actor_id uuid, p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case p_target_type
      when 'cases' then coalesce((select c.is_test from public.cases c where c.case_id = p_target_id), false)
      when 'clients' then coalesce((select c.is_test from public.clients c where c.client_id = p_target_id), false)
      when 'client_quarterly_reports' then coalesce((select c.is_test from public.clients c where c.client_id = p_target_id), false)
      when 'client_admins' then coalesce(
        (select c.is_test from public.client_admins ca join public.clients c on c.client_id = ca.client_id where ca.admin_id = p_target_id),
        (select c.is_test from public.clients c where c.client_id = p_target_id),
        false)
      when 'accounts' then coalesce(
        (select a.is_test or coalesce(c.is_test, false) from public.accounts a left join public.clients c on c.client_id = a.client_id where a.account_id = p_target_id), false)
      else false
    end
    or
    case p_actor_type
      when 'account' then coalesce(
        (select a.is_test or coalesce(c.is_test, false) from public.accounts a left join public.clients c on c.client_id = a.client_id where a.account_id = p_actor_id), false)
      when 'client_admin' then coalesce(
        (select c.is_test from public.client_admins ca join public.clients c on c.client_id = ca.client_id where ca.admin_id = p_actor_id), false)
      else false
    end;
$$;

revoke all on function private.audit_is_test(text, uuid, text, uuid) from public, anon;
grant execute on function private.audit_is_test(text, uuid, text, uuid) to authenticated, service_role;

-- 既存の案件を取り直す（今回の判定の変更を反映）
update public.cases c set is_test = public.case_is_test_for(c.client_id, c.account_id)
 where c.is_test is distinct from public.case_is_test_for(c.client_id, c.account_id);
