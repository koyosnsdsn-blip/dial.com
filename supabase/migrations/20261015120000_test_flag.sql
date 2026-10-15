-- テストフラグ（2026-10-15 ダイヤルさんの指示）
--
-- 本番に残すテスト用のクライアント・アカウントを、実際の利用と見分けて管理する。
--   clients.is_test  … テスト用のクライアント。このクライアントの案件は、すべてテストとして扱う
--   accounts.is_test … テスト用の利用者アカウント（クライアントに所属しない個人のテスト用）
--   cases.is_test    … 案件がテストか。クライアントまたはアカウントのどちらかがテストなら true。
--                      案件の作成時に自動で決め、クライアント／アカウントのフラグを変えたときは、既存の案件にも反映する
--                      （案件に持たせるのは、一覧の絞り込み・集計・Realtime で結合なしに使えるようにするため。手で書き換えない）
--   audit_logs_v     … 監査ログに is_test を付けたビュー。ログは追記専用で書き換えられないため、
--                      操作の対象（案件・クライアント・アカウント）や実行者が「いま」テストかを、読むときに判定する
--
-- 相談者・クライアント管理者には見せない（運営画面のみ）。フラグの変更は運営管理者のみ・理由必須・監査ログ（サーバールート）。

alter table public.clients  add column if not exists is_test boolean not null default false;
alter table public.accounts add column if not exists is_test boolean not null default false;
alter table public.cases    add column if not exists is_test boolean not null default false;

comment on column public.clients.is_test  is 'テスト用のクライアント。所属する案件はすべてテスト扱い（運営画面でのみ表示）';
comment on column public.accounts.is_test is 'テスト用の利用者アカウント（運営画面でのみ表示）';
comment on column public.cases.is_test    is 'テスト案件か。clients.is_test または accounts.is_test から自動で決まる。手で書き換えない';

create index if not exists ix_cases_is_test on public.cases (is_test) where is_test;

-- 案件の作成時に決める（付与の関数を変えずに済むよう、トリガで行う）
create or replace function public.set_case_is_test()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_test := coalesce((select c.is_test from public.clients c where c.client_id = new.client_id), false)
              or coalesce((select a.is_test from public.accounts a where a.account_id = new.account_id), false);
  return new;
end;
$$;

drop trigger if exists trg_set_case_is_test on public.cases;
create trigger trg_set_case_is_test
  before insert on public.cases
  for each row execute function public.set_case_is_test();

-- クライアントのフラグを変えたら、そのクライアントの案件に反映する（個別アカウントがテストの案件は true のまま）
create or replace function public.propagate_client_is_test()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cases c
     set is_test = new.is_test or coalesce((select a.is_test from public.accounts a where a.account_id = c.account_id), false)
   where c.client_id = new.client_id
     and c.is_test is distinct from (new.is_test or coalesce((select a.is_test from public.accounts a where a.account_id = c.account_id), false));
  return new;
end;
$$;

drop trigger if exists trg_propagate_client_is_test on public.clients;
create trigger trg_propagate_client_is_test
  after update of is_test on public.clients
  for each row when (old.is_test is distinct from new.is_test)
  execute function public.propagate_client_is_test();

-- アカウントのフラグを変えたら、そのアカウントの案件に反映する（クライアントがテストの案件は true のまま）
create or replace function public.propagate_account_is_test()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cases c
     set is_test = new.is_test or coalesce((select cl.is_test from public.clients cl where cl.client_id = c.client_id), false)
   where c.account_id = new.account_id
     and c.is_test is distinct from (new.is_test or coalesce((select cl.is_test from public.clients cl where cl.client_id = c.client_id), false));
  return new;
end;
$$;

drop trigger if exists trg_propagate_account_is_test on public.accounts;
create trigger trg_propagate_account_is_test
  after update of is_test on public.accounts
  for each row when (old.is_test is distinct from new.is_test)
  execute function public.propagate_account_is_test();

revoke all on function public.set_case_is_test(), public.propagate_client_is_test(), public.propagate_account_is_test() from public, anon, authenticated;

-- 監査ログの「テスト」判定。ブラウザ（PostgREST）から直接呼べないよう、公開しないスキーマに置く。
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- 操作の対象、または実行者が、テスト（のクライアント・アカウント・案件）か
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
      -- レポートの対象はクライアントのID。クライアント管理者の対象は、管理者のIDまたはクライアントのID
      when 'client_quarterly_reports' then coalesce((select c.is_test from public.clients c where c.client_id = p_target_id), false)
      when 'client_admins' then coalesce(
        (select c.is_test from public.client_admins ca join public.clients c on c.client_id = ca.client_id where ca.admin_id = p_target_id),
        (select c.is_test from public.clients c where c.client_id = p_target_id),
        false)
      when 'accounts' then coalesce((select a.is_test from public.accounts a where a.account_id = p_target_id), false)
      else false
    end
    or
    case p_actor_type
      when 'account' then coalesce((select a.is_test from public.accounts a where a.account_id = p_actor_id), false)
      when 'client_admin' then coalesce(
        (select c.is_test from public.client_admins ca join public.clients c on c.client_id = ca.client_id where ca.admin_id = p_actor_id), false)
      else false
    end;
$$;

revoke all on function private.audit_is_test(text, uuid, text, uuid) from public, anon;
grant execute on function private.audit_is_test(text, uuid, text, uuid) to authenticated, service_role;

-- 呼び出した本人の権限（RLS）で読む。audit_logs の RLS（運営管理者・aal2 のみ）がそのまま効く
create or replace view public.audit_logs_v with (security_invoker = true) as
  select a.log_id, a.actor_type, a.actor_id, a.action, a.target_type, a.target_id, a.reason, a.acted_at,
         private.audit_is_test(a.actor_type, a.actor_id, a.target_type, a.target_id) as is_test
    from public.audit_logs a;

revoke all on public.audit_logs_v from anon;
grant select on public.audit_logs_v to authenticated;
grant all on public.audit_logs_v to service_role;

comment on view public.audit_logs_v is '監査ログ＋テスト判定（is_test）。追記専用の audit_logs を書き換えずに、読むときに判定する';
