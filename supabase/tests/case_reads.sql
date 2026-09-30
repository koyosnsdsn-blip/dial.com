-- 未読の返信の判定（case_reads と my_cases.has_unread）のテスト
--   R1 自分の送信だけでは未読にならない
--   R2 相談員の返信があると未読になる
--   R3 ログイン中のブラウザ（authenticated）は case_reads を読み書きできない
--   R4 既読を記録すると未読でなくなる
--   R5 既読のあとに新しい返信が来ると、また未読になる
--   R6 他人の案件は my_cases に出ない
-- 最終実行：2026-10-01 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u1 uuid := '00000000-0000-4000-8000-0000000000f1'; u2 uuid := '00000000-0000-4000-8000-0000000000f2';
  e1 uuid := gen_random_uuid(); c1 uuid := gen_random_uuid(); n int; b boolean; failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (u1, 'rd-1@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u2, 'rd-2@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into accounts (account_id, email) values (u1, 'rd-1@test.invalid'), (u2, 'rd-2@test.invalid');
  insert into entitlements (entitlement_id, account_id, source, rally_max, sla_hours) values (e1, u1, 'payment', 5, 24);
  insert into cases (case_id, entitlement_id, account_id) values (c1, e1, u1);
  insert into messages (case_id, sender, body, sent_at) values (c1, 'user', '相談', now() - interval '3 hours');

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select has_unread into b from my_cases where case_id = c1;
  if b is not false then failures := failures || 'R1 自分の送信だけで未読になった; '; end if;
  reset role;

  insert into messages (case_id, sender, body, sent_at) values (c1, 'counselor', '返信', now() - interval '1 hour');
  set local role authenticated;
  select has_unread into b from my_cases where case_id = c1;
  if b is not true then failures := failures || 'R2 返信があるのに未読にならない; '; end if;
  begin
    select count(*) into n from case_reads;
    failures := failures || 'R3 authenticatedがcase_readsを読めた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into case_reads (case_id) values (c1);
    failures := failures || 'R3 authenticatedがcase_readsに書けた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  set local role service_role;
  insert into case_reads (case_id, account_read_at) values (c1, now()) on conflict (case_id) do update set account_read_at = excluded.account_read_at;
  reset role;
  set local role authenticated;
  select has_unread into b from my_cases where case_id = c1;
  if b is not false then failures := failures || 'R4 既読にしても未読のまま; '; end if;
  reset role;

  insert into messages (case_id, sender, body, sent_at) values (c1, 'counselor', '返信2', now() + interval '1 second');
  set local role authenticated;
  select has_unread into b from my_cases where case_id = c1;
  if b is not true then failures := failures || 'R5 新しい返信が未読にならない; '; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from my_cases;
  if n <> 0 then failures := failures || 'R6 他人の案件が見えた; '; end if;
  reset role;

  if failures = '' then raise exception 'READS TEST PASSED（R1〜R6。取り消し済み）';
  else raise exception 'READS TEST FAILED: %', failures; end if;
end $$;
