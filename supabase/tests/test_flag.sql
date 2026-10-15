-- テストフラグのテスト（2026-10-15）
--   F1 案件の作成時に is_test が決まる（テストのクライアント／テストのアカウントなら true、通常は false）
--   F2 クライアントのフラグを変えると、既存の案件に反映される。個別アカウントがテストの案件は、クライアントを戻しても true のまま
--   F3 アカウントのフラグを変えると、既存の案件に反映される。クライアントがテストの案件は、アカウントを戻しても true のまま
--   F4 監査ログのビュー audit_logs_v：対象の案件／クライアント／アカウント、実行者（利用者）がテストなら is_test = true
--   F5 運営管理者（aal2）はビューを読める。相談員・未ログイン（anon）は読めない。ブラウザから private スキーマの関数は呼べない
-- 最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u_admin uuid := gen_random_uuid(); u_cn uuid := gen_random_uuid();
  u_t uuid := gen_random_uuid();   -- テストのアカウント（クライアントなし）
  u_n uuid := gen_random_uuid();   -- 通常のアカウント（クライアントなし）
  u_c uuid := gen_random_uuid();   -- 通常のアカウント（クライアント所属）
  cl_t uuid := gen_random_uuid(); cl_n uuid := gen_random_uuid();
  ent uuid; c_t uuid; c_n uuid; c_acct uuid; c_cl uuid;
  n int; b boolean; failures text := '';
  function_exposed boolean;
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (u_admin, 'f-admin@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_cn,    'f-cn@test.invalid',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_t,     'f-t@test.invalid',     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_n,     'f-n@test.invalid',     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_c,     'f-c@test.invalid',     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into counselors (counselor_id, name, role) values (u_admin, 'F管理者', 'admin'), (u_cn, 'F相談員', 'counselor');
  insert into clients (client_id, name, contract_type, status, feature_consult, rally_max, sla_hours, is_test) values
    (cl_t, 'Fテストクライアント', 'corp', 'active', true, 2, 12, true),
    (cl_n, 'F通常クライアント',   'corp', 'active', true, 2, 12, false);
  insert into accounts (account_id, email, is_test) values (u_t, 'f-t@test.invalid', true);
  insert into accounts (account_id, email) values (u_n, 'f-n@test.invalid');
  insert into accounts (account_id, email, client_id, tier) values (u_c, 'f-c@test.invalid', cl_n, 'member');

  -- 案件を1件作るための小さな手順（利用権→案件）
  -- F1
  insert into entitlements (account_id, source, client_id, rally_max, sla_hours) values (u_t, 'client', cl_t, 2, 12) returning entitlement_id into ent;
  insert into cases (entitlement_id, account_id, client_id) values (ent, u_t, cl_t) returning case_id into c_t;       -- テストのクライアント＋テストのアカウント
  insert into entitlements (account_id, source, client_id, rally_max, sla_hours) values (u_n, 'client', cl_t, 2, 12) returning entitlement_id into ent;
  insert into cases (entitlement_id, account_id, client_id) values (ent, u_n, cl_t) returning case_id into c_cl;      -- テストのクライアントのみ
  insert into entitlements (account_id, source, client_id, rally_max, sla_hours) values (u_c, 'client', cl_n, 2, 12) returning entitlement_id into ent;
  insert into cases (entitlement_id, account_id, client_id) values (ent, u_c, cl_n) returning case_id into c_n;       -- どちらも通常
  select (select is_test from cases where case_id = c_t) and (select is_test from cases where case_id = c_cl) and not (select is_test from cases where case_id = c_n) into b;
  if not b then failures := failures || 'F1 作成時の is_test が違う; '; end if;

  -- テストのアカウントの個人の案件（クライアントなし）
  insert into entitlements (account_id, source, rally_max, sla_hours, granted_free) values (u_t, 'payment', 2, 12, true) returning entitlement_id into ent;
  begin
    insert into cases (entitlement_id, account_id) values (ent, u_t) returning case_id into c_acct;
  exception when unique_violation then
    -- 1アカウントにつき対応中の案件は1件まで：先の案件を終了してから作る
    update cases set status = 'closed', close_reason = 'manual', closed_at = now() where account_id = u_t and status = 'open';
    insert into cases (entitlement_id, account_id) values (ent, u_t) returning case_id into c_acct;
  end;
  if not (select is_test from cases where case_id = c_acct) then failures := failures || 'F1 テストのアカウントの案件が false; '; end if;

  -- F2：クライアント cl_t を通常に戻す
  update clients set is_test = false where client_id = cl_t;
  if (select is_test from cases where case_id = c_cl) then failures := failures || 'F2 クライアントを戻したのに案件が true; '; end if;
  if not (select is_test from cases where case_id = c_t) then failures := failures || 'F2 テストのアカウントの案件まで false になった; '; end if;
  update clients set is_test = true where client_id = cl_t;
  if not (select is_test from cases where case_id = c_cl) then failures := failures || 'F2 クライアントをテストにしたのに案件が false; '; end if;

  -- F3：通常のクライアント cl_n の案件 c_n を持つアカウント u_c をテストにする → 反映。戻す → false に戻る
  update accounts set is_test = true where account_id = u_c;
  if not (select is_test from cases where case_id = c_n) then failures := failures || 'F3 アカウントをテストにしたのに案件が false; '; end if;
  update clients set is_test = true where client_id = cl_n;   -- クライアントもテストに
  update accounts set is_test = false where account_id = u_c; -- アカウントだけ戻しても、クライアントがテストなので true のまま
  if not (select is_test from cases where case_id = c_n) then failures := failures || 'F3 クライアントがテストなのに案件が false; '; end if;
  update clients set is_test = false where client_id = cl_n;
  if (select is_test from cases where case_id = c_n) then failures := failures || 'F3 どちらも通常に戻したのに案件が true; '; end if;

  -- F4：監査ログ
  insert into audit_logs (actor_type, actor_id, action, target_type, target_id) values
    ('counselor', u_admin, 'case.view', 'cases', c_cl),                 -- テストの案件への操作
    ('counselor', u_admin, 'case.view', 'cases', c_n),                  -- 通常の案件への操作
    ('counselor', u_admin, 'client.update', 'clients', cl_t),           -- テストのクライアントへの操作
    ('counselor', u_admin, 'client.update', 'clients', cl_n),           -- 通常のクライアントへの操作
    ('account', u_t, 'qa.post', 'questions', null),                     -- テストのアカウントによる操作
    ('account', u_n, 'qa.post', 'questions', null),                     -- 通常のアカウントによる操作
    ('counselor', u_admin, 'client.report.list', 'client_quarterly_reports', cl_t),
    ('counselor', u_admin, 'audit.view', 'audit_logs', null);
  select count(*) into n from audit_logs_v where is_test and actor_id in (u_admin, u_t, u_n) and acted_at >= now() - interval '1 minute';
  if n <> 4 then failures := failures || format('F4 テスト判定の件数が違う（期待4、実際%s）; ', n); end if;
  select count(*) into n from audit_logs_v where not is_test and actor_id in (u_admin, u_t, u_n) and acted_at >= now() - interval '1 minute';
  if n <> 4 then failures := failures || format('F4 通常判定の件数が違う（期待4、実際%s）; ', n); end if;

  -- F5：運営管理者（aal2）は読める。相談員・anon は読めない。ブラウザから private の関数は呼べない
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from audit_logs_v where actor_id in (u_admin, u_t, u_n);
  if n < 8 then failures := failures || format('F5 運営管理者がビューを読めない（%s件）; ', n); end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_cn, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from audit_logs_v;
  if n <> 0 then failures := failures || format('F5 相談員がビューを読めた（%s件）; ', n); end if;
  reset role;

  set local role anon;
  begin
    select count(*) into n from audit_logs_v;
    failures := failures || 'F5 anon がビューを読めた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.audit_is_test('account', u_t, 'cases', c_t);
    failures := failures || 'F5 anon が private の関数を呼べた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- PostgREST が公開するのは public スキーマのみ。private の関数が public に無いことを確認する
  select exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'audit_is_test') into function_exposed;
  if function_exposed then failures := failures || 'F5 audit_is_test が public にある; '; end if;

  -- F6：テストのクライアントに所属するアカウントの、個人の相談（cases.client_id が空）もテスト。所属が変わると追従する
  declare u_m uuid := gen_random_uuid(); ent2 uuid; c_m uuid;
  begin
    insert into auth.users (id, email, aud, role, instance_id) values (u_m, 'f-m@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
    insert into accounts (account_id, email, client_id, tier) values (u_m, 'f-m@test.invalid', cl_n, 'member');
    insert into entitlements (account_id, source, rally_max, sla_hours, granted_free) values (u_m, 'payment', 2, 12, true) returning entitlement_id into ent2;
    insert into cases (entitlement_id, account_id) values (ent2, u_m) returning case_id into c_m;   -- 個人の相談（クライアントなし）
    if (select is_test from cases where case_id = c_m) then failures := failures || 'F6 通常のクライアントの会員の個人の相談が true; '; end if;
    update clients set is_test = true where client_id = cl_n;
    if not (select is_test from cases where case_id = c_m) then failures := failures || 'F6 クライアントをテストにしたのに会員の個人の相談が false; '; end if;
    update accounts set client_id = null where account_id = u_m;   -- 所属が外れる
    if (select is_test from cases where case_id = c_m) then failures := failures || 'F6 所属が外れたのに true; '; end if;
    update accounts set client_id = cl_n where account_id = u_m;   -- 所属し直す
    if not (select is_test from cases where case_id = c_m) then failures := failures || 'F6 所属し直したのに false; '; end if;
    if not (select is_test from audit_logs_v where false union all select private.audit_is_test('account', u_m, 'accounts', u_m)) then failures := failures || 'F6 監査ログの判定が会員を見ていない; '; end if;
  end;

  if failures <> '' then
    raise exception 'test_flag FAILED: %', failures;
  end if;
  raise exception 'test_flag PASSED（テストデータは取り消されます）';
end $$;
