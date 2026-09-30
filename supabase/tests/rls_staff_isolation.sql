-- RLS 分離テスト（CLAUDE.md 制約#2、技術基盤設計書 3.2 試験項目）
--
-- 確認すること：
--   T1 相談員A（MFA済）は自分の担当案件だけを読める。相談員Bの案件・メッセージは読めない
--   T2 相談員A（MFA未通過＝aal1）は自分の担当案件すら読めない（staff_require_mfa）
--   T3 運営管理者（MFA済）は全案件を読める
--   T4 利用者本人（MFA未設定＝aal1）は自分の案件・メッセージを読める。相談サマリ・緊急記録は読めない
--   T5 別の利用者は他人の案件を1件も読めない
--   T6 未ログイン（anon）は何も読めない（テーブル権限なし）
--   T7 ログイン済みでも相談内容系テーブルへ直接 INSERT / UPDATE できない（書き込みはサーバールート経由のみ）
--   T8 サーバーAPI用の service_role は全案件を読め、監査ログへ書き込める
--
-- 最終実行：2026-09-30 dev（dial-dot-com-dev）で T1〜T8 すべて合格
--
-- 実行方法：このファイル全体をそのまま実行する（Supabase の SQL Editor、または MCP の execute_sql）。
-- 最後に必ず例外を投げてトランザクションごと取り消すため、テストデータは DB に残らない。
--   成功時のメッセージ： "RLS TEST PASSED ..."
--   失敗時のメッセージ： "RLS TEST FAILED: ..."（どの項目が期待と違ったかを列挙）

do $$
declare
  u_a      uuid := '00000000-0000-4000-8000-00000000000a';  -- 相談員A
  u_b      uuid := '00000000-0000-4000-8000-00000000000b';  -- 相談員B
  u_admin  uuid := '00000000-0000-4000-8000-00000000000c';  -- 運営管理者
  u_user1  uuid := '00000000-0000-4000-8000-00000000000d';  -- 利用者1（案件あり）
  u_user2  uuid := '00000000-0000-4000-8000-00000000000e';  -- 利用者2（案件なし）
  e_1      uuid := gen_random_uuid();
  e_2      uuid := gen_random_uuid();
  c_a      uuid := gen_random_uuid();  -- 相談員A担当の案件
  c_b      uuid := gen_random_uuid();  -- 相談員B担当の案件
  n        int;
  failures text := '';
begin
  -- ---------- テストデータ（postgres 権限で投入） ----------
  insert into auth.users (id, email, aud, role, instance_id)
  values
    (u_a,     'rls-a@test.invalid',     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_b,     'rls-b@test.invalid',     'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_admin, 'rls-admin@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_user1, 'rls-u1@test.invalid',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_user2, 'rls-u2@test.invalid',    'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

  insert into counselors (counselor_id, name, role) values
    (u_a, 'テスト相談員A', 'counselor'),
    (u_b, 'テスト相談員B', 'counselor'),
    (u_admin, 'テスト管理者', 'admin');

  insert into accounts (account_id, email) values
    (u_user1, 'rls-u1@test.invalid'),
    (u_user2, 'rls-u2@test.invalid');

  insert into entitlements (entitlement_id, account_id, source, rally_max, sla_hours) values
    (e_1, u_user1, 'payment', 5, 24),
    (e_2, u_user1, 'payment', 5, 24);

  insert into cases (case_id, entitlement_id, account_id, counselor_id, status) values
    (c_a, e_1, u_user1, u_a, 'open'),
    (c_b, e_2, u_user1, u_b, 'closed');

  insert into messages (case_id, sender, body) values
    (c_a, 'user', 'A担当案件のメッセージ'),
    (c_b, 'user', 'B担当案件のメッセージ');

  insert into case_summaries (case_id, content) values (c_a, 'Aのサマリ'), (c_b, 'Bのサマリ');
  insert into emergency_records (case_id, detection) values (c_a, 'テスト');

  -- ---------- 以降はログイン中のブラウザと同じ権限（authenticated / anon）で検査 ----------

  -- T1 相談員A・MFA済
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from cases;                        if n <> 1 then failures := failures || format('T1 cases=%s(期待1); ', n); end if;
  select count(*) into n from cases where case_id = c_b;    if n <> 0 then failures := failures || 'T1 B案件が見えた; '; end if;
  select count(*) into n from messages;                     if n <> 1 then failures := failures || format('T1 messages=%s(期待1); ', n); end if;
  select count(*) into n from case_summaries;               if n <> 1 then failures := failures || format('T1 summaries=%s(期待1); ', n); end if;
  reset role;

  -- T2 相談員A・MFA未通過
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from cases;                        if n <> 0 then failures := failures || format('T2 cases=%s(期待0); ', n); end if;
  select count(*) into n from messages;                     if n <> 0 then failures := failures || format('T2 messages=%s(期待0); ', n); end if;
  select count(*) into n from counselors;                   if n <> 0 then failures := failures || format('T2 counselors=%s(期待0); ', n); end if;
  reset role;

  -- T3 運営管理者・MFA済
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from cases where case_id in (c_a, c_b);  if n <> 2 then failures := failures || format('T3 cases=%s(期待2); ', n); end if;
  select count(*) into n from emergency_records where case_id = c_a; if n <> 1 then failures := failures || format('T3 emergency=%s(期待1); ', n); end if;
  reset role;

  -- T4 利用者本人・aal1
  perform set_config('request.jwt.claims', json_build_object('sub', u_user1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from cases;                        if n <> 2 then failures := failures || format('T4 cases=%s(期待2); ', n); end if;
  select count(*) into n from messages;                     if n <> 2 then failures := failures || format('T4 messages=%s(期待2); ', n); end if;
  select count(*) into n from case_summaries;               if n <> 0 then failures := failures || format('T4 summaries=%s(期待0); ', n); end if;
  select count(*) into n from emergency_records;            if n <> 0 then failures := failures || format('T4 emergency=%s(期待0); ', n); end if;
  select count(*) into n from counselors;                   if n <> 0 then failures := failures || format('T4 counselors=%s(期待0); ', n); end if;
  reset role;

  -- T5 別の利用者
  perform set_config('request.jwt.claims', json_build_object('sub', u_user2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from cases;                        if n <> 0 then failures := failures || format('T5 cases=%s(期待0); ', n); end if;
  select count(*) into n from messages;                     if n <> 0 then failures := failures || format('T5 messages=%s(期待0); ', n); end if;
  reset role;

  -- T6 未ログイン（anon にはテーブル権限自体を付与していないため、読もうとした時点で拒否される）
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select count(*) into n from cases;
    failures := failures || format('T6 anonがcasesを読めた(%s件); ', n);
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from payments;
    failures := failures || format('T6 anonがpaymentsを読めた(%s件); ', n);
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- T7 直接 INSERT の拒否（利用者本人・相談員Aとも）
  perform set_config('request.jwt.claims', json_build_object('sub', u_user1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    insert into messages (case_id, sender, body) values (c_a, 'user', '直接書き込み');
    failures := failures || 'T7 利用者がmessagesへ直接INSERTできた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    update cases set urgent_flag = true where case_id = c_a;
    get diagnostics n = row_count;
    if n <> 0 then failures := failures || 'T7 相談員がcasesを直接UPDATEできた; '; end if;
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- T8 サーバーAPIが使う service_role は全案件を読め、監査ログに書き込める
  set local role service_role;
  select count(*) into n from cases where case_id in (c_a, c_b);  if n <> 2 then failures := failures || format('T8 service_role cases=%s(期待2); ', n); end if;
  insert into audit_logs (actor_type, action, target_type) values ('system', 'rls_test', 'test');
  reset role;

  -- ---------- 結果（必ず例外で終了し、テストデータを取り消す） ----------
  if failures = '' then
    raise exception 'RLS TEST PASSED (T1-T8 すべて期待どおり。テストデータは取り消し済み)';
  else
    raise exception 'RLS TEST FAILED: %', failures;
  end if;
end
$$;
