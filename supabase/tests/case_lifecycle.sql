-- 無操作による自動クローズと、利用者による相談内容の削除のテスト
--   L1 my_cases.idle_close_at：企業枠で返信待ちでない対応中の案件にだけ、自動終了の予定日時が出る
--   L2 system_close_idle_cases：無操作の企業枠の案件だけを閉じる（返信待ち・個人課金は閉じない）。監査ログに残る
--   L3 対応中の案件・他人の案件は削除できない
--   L4 削除するとメッセージが非表示になり、物理削除の予定日時が入り、本人の一覧から消える
--   L5 二重に削除できない
--   L6 定期実行（pg_cron）が登録されている
-- 最終実行：2026-10-01 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u1 uuid := '00000000-0000-4000-8000-0000000000d1'; u2 uuid := '00000000-0000-4000-8000-0000000000d2';
  cl uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid(); e3 uuid := gen_random_uuid();
  c_idle uuid := gen_random_uuid(); c_wait uuid := gen_random_uuid(); c_pay uuid := gen_random_uuid();
  n int; t timestamptz; jobs int; failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (u1, 'lc-1@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u2, 'lc-2@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into clients (client_id, name, contract_type, status, feature_consult) values (cl, 'テスト', 'corp', 'active', true);
  insert into accounts (account_id, email) values (u1, 'lc-1@test.invalid'), (u2, 'lc-2@test.invalid');
  insert into entitlements (entitlement_id, account_id, source, client_id, rally_max, sla_hours) values
    (e1, u1, 'client', cl, 2, 24), (e2, u2, 'client', cl, 2, 24), (e3, u1, 'payment', null, 5, 24);
  insert into cases (case_id, entitlement_id, account_id, client_id, status, last_activity_at, opened_at) values
    (c_idle, e1, u1, cl, 'open', now() - interval '20 days', now() - interval '21 days');
  insert into cases (case_id, entitlement_id, account_id, client_id, status, last_activity_at, awaiting_reply_since, opened_at) values
    (c_wait, e2, u2, cl, 'open', now() - interval '20 days', now() - interval '20 days', now() - interval '21 days');
  insert into messages (case_id, sender, body) values (c_idle, 'user', 'a'), (c_idle, 'counselor', 'b');

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select idle_close_at into t from my_cases where case_id = c_idle;
  if t is null or abs(extract(epoch from (t - (now() - interval '6 days')))) > 60 then failures := failures || format('L1 idle_close_at=%s; ', t); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select idle_close_at into t from my_cases where case_id = c_wait;
  if t is not null then failures := failures || 'L1 返信待ちの案件に予定日時が出た; '; end if;
  reset role;

  n := system_close_idle_cases();
  if n < 1 then failures := failures || format('L2 closed=%s; ', n); end if;
  select count(*) into n from cases where case_id = c_idle and status = 'closed' and close_reason = 'idle' and closed_at is not null;
  if n <> 1 then failures := failures || 'L2 無操作の案件が閉じていない; '; end if;
  select count(*) into n from cases where case_id = c_wait and status = 'open';
  if n <> 1 then failures := failures || 'L2 返信待ちの案件まで閉じた; '; end if;
  select count(*) into n from audit_logs where action = 'case.close.idle' and target_id = c_idle;
  if n <> 1 then failures := failures || 'L2 監査ログがない; '; end if;
  insert into cases (case_id, entitlement_id, account_id, status, last_activity_at) values (c_pay, e3, u1, 'open', now() - interval '20 days');
  perform system_close_idle_cases();
  select count(*) into n from cases where case_id = c_pay and status = 'open';
  if n <> 1 then failures := failures || 'L2 個人課金の案件まで閉じた; '; end if;

  begin
    perform user_delete_case(u1, c_pay);
    failures := failures || 'L3 対応中の案件を削除できた; ';
  exception when others then
    if sqlerrm <> 'case_open' then failures := failures || format('L3 例外=%s; ', sqlerrm); end if;
  end;
  begin
    perform user_delete_case(u2, c_idle);
    failures := failures || 'L3 他人の案件を削除できた; ';
  exception when others then
    if sqlerrm <> 'not_found' then failures := failures || format('L3 他人の例外=%s; ', sqlerrm); end if;
  end;
  perform user_delete_case(u1, c_idle);
  select count(*) into n from messages where case_id = c_idle and hidden_at is not null and purge_after > now() + interval '29 days';
  if n <> 2 then failures := failures || format('L4 非表示化=%s(期待2); ', n); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from my_cases where case_id = c_idle;
  if n <> 0 then failures := failures || 'L4 削除した案件が一覧に出た; '; end if;
  select count(*) into n from my_cases where case_id = c_pay;
  if n <> 1 then failures := failures || 'L4 他の案件まで消えた; '; end if;
  reset role;
  begin
    perform user_delete_case(u1, c_idle);
    failures := failures || 'L5 二重に削除できた; ';
  exception when others then
    if sqlerrm <> 'not_found' then failures := failures || format('L5 例外=%s; ', sqlerrm); end if;
  end;
  select count(*) into jobs from cron.job where jobname = 'close-idle-cases' and active;
  if jobs <> 1 then failures := failures || format('L6 cron=%s; ', jobs); end if;

  if failures = '' then raise exception 'LIFECYCLE TEST PASSED（L1〜L6。取り消し済み）';
  else raise exception 'LIFECYCLE TEST FAILED: %', failures; end if;
end $$;
