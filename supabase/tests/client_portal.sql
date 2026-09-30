-- クライアント管理サイト向けの四半期レポート（system_generate_quarterly_reports）と、その閲覧範囲（RLS）のテスト
--   Q1 企業契約型：総件数が10件以上なら内訳を出し、5件未満のジャンルは「その他」に合算する
--   Q2 企業契約型：総件数が10件未満なら、件数だけを出し、内訳は出さない
--   Q3 企業契約型：従業員数が30人未満のクライアントには、相談に関する数値を出さない（登録件数は出す）
--   Q4 自治体委託型：制限を適用しない
--   Q5 SLA遵守率（最初の相談から最初の返信まで）　Q6 まだ終わっていない四半期・四半期の初日でない日付は拒否する
--   Q7 作り直すと上書きされる（行が増えない）　Q8 監査ログに残る　Q9 定期実行が2件登録されている
--   V1 クライアント管理者は、自分のクライアントの行だけを読める　V2 多要素認証を通過していないと読めない
--   V3 失効したクライアント管理者は読めない　V4 相談内容系テーブルは1行も読めない
--   V5 ログイン中のブラウザ（authenticated）は、レポートを書けず、作成関数も呼べない
-- 最終実行：2026-10-01 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u uuid := '00000000-0000-4000-8000-0000000000c1';
  a1 uuid := '00000000-0000-4000-8000-0000000000c2'; a2 uuid := '00000000-0000-4000-8000-0000000000c3'; b1 uuid := '00000000-0000-4000-8000-0000000000c4';
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cc uuid := gen_random_uuid(); cd uuid := gen_random_uuid();
  q date := (date_trunc('quarter', (now() at time zone 'Asia/Tokyo')::date) - interval '3 months')::date;
  t timestamptz; e uuid; c uuid; i int; n int; rep record; failures text := '';
  spec record;
begin
  t := ((q + 40)::text || ' 12:00:00+09')::timestamptz;
  insert into auth.users (id, email, aud, role, instance_id, encrypted_password) values
    (u, 'cp-u@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x'),
    (a1, 'cp-a1@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x'),
    (a2, 'cp-a2@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x'),
    (b1, 'cp-b1@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x');
  insert into clients (client_id, name, contract_type, status, feature_consult, employee_count) values
    (ca, 'テストA', 'corp', 'active', true, 100), (cb, 'テストB', 'corp', 'active', true, 100),
    (cc, 'テストC', 'corp', 'active', true, 20), (cd, 'テストD', 'muni', 'active', true, 10);
  insert into accounts (account_id, email, tier, client_id) values (u, 'cp-u@test.invalid', 'member', ca);
  insert into client_admins (admin_id, client_id, name) values (a1, ca, '管理者1'), (a2, ca, '管理者2'), (b1, cb, '管理者B');

  -- A：12件（仕事7・家族3・健康2）　B：4件　C：3件　D：3件（仕事2・家族1）
  for spec in
    select * from (values (ca, '仕事', 7), (ca, '家族', 3), (ca, '健康', 2), (cb, '仕事', 4), (cc, '仕事', 3), (cd, '仕事', 2), (cd, '家族', 1)) v(cl, label, cnt)
  loop
    for i in 1..spec.cnt loop
      e := gen_random_uuid(); c := gen_random_uuid();
      insert into entitlements (entitlement_id, account_id, source, client_id, rally_max, sla_hours) values (e, u, 'client', spec.cl, 1, 24);
      insert into cases (case_id, entitlement_id, account_id, client_id, status, close_reason, closed_at, opened_at) values (c, e, u, spec.cl, 'closed', 'manual', t + interval '3 days', t);
      insert into case_survey_answers (case_id, survey_question_id, kind, question_text_snapshot, option_label_snapshot) values (c, '5e000000-0000-4000-8000-0000000000b2', 'chief', 'q', spec.label);
      -- A の「家族」3件：1件は 30時間後に返信（SLA超過）、2件は 2時間後に返信
      if spec.cl = ca and spec.label = '家族' then
        insert into messages (case_id, sender, body, sent_at) values (c, 'user', 'x', t), (c, 'counselor', 'y', t + case when i = 1 then interval '30 hours' else interval '2 hours' end);
      end if;
    end loop;
  end loop;

  perform system_generate_quarterly_reports(q, ca);
  perform system_generate_quarterly_reports(q, cb);
  perform system_generate_quarterly_reports(q, cc);
  perform system_generate_quarterly_reports(q, cd);

  select * into rep from client_quarterly_reports where client_id = ca and quarter_start = q;
  if rep.cases_total is distinct from 12 or rep.genres is distinct from '[{"label":"仕事","count":7},{"label":"その他","count":5}]'::jsonb then
    failures := failures || format('Q1 total=%s genres=%s; ', rep.cases_total, rep.genres);
  end if;
  if rep.members is distinct from 1 then failures := failures || format('Q1 members=%s; ', rep.members); end if;
  if rep.sla_rate is distinct from 67 then failures := failures || format('Q5 sla=%s; ', rep.sla_rate); end if;
  select * into rep from client_quarterly_reports where client_id = cb and quarter_start = q;
  if rep.cases_total is distinct from 4 or rep.genres is not null then failures := failures || format('Q2 total=%s genres=%s; ', rep.cases_total, rep.genres); end if;
  select * into rep from client_quarterly_reports where client_id = cc and quarter_start = q;
  if rep.cases_total is not null or rep.genres is not null or rep.sla_rate is not null or rep.members is null then failures := failures || 'Q3 小規模クライアントに数値が出た; '; end if;
  select * into rep from client_quarterly_reports where client_id = cd and quarter_start = q;
  if rep.cases_total is distinct from 3 or rep.genres is distinct from '[{"label":"仕事","count":2},{"label":"家族","count":1}]'::jsonb then
    failures := failures || format('Q4 total=%s genres=%s; ', rep.cases_total, rep.genres);
  end if;

  begin
    perform system_generate_quarterly_reports(date_trunc('quarter', (now() at time zone 'Asia/Tokyo')::date)::date, ca);
    failures := failures || 'Q6 終わっていない四半期を作れた; ';
  exception when others then
    if sqlerrm <> 'quarter_not_finished' then failures := failures || format('Q6 例外=%s; ', sqlerrm); end if;
  end;
  begin
    perform system_generate_quarterly_reports(q + 1, ca);
    failures := failures || 'Q6 四半期の初日でない日付で作れた; ';
  exception when others then
    if sqlerrm <> 'invalid_quarter' then failures := failures || format('Q6 例外=%s; ', sqlerrm); end if;
  end;

  perform system_generate_quarterly_reports(q, ca);
  select count(*) into n from client_quarterly_reports where client_id = ca;
  if n <> 1 then failures := failures || format('Q7 行数=%s; ', n); end if;
  select count(*) into n from audit_logs where action = 'report.generate';
  if n < 5 then failures := failures || format('Q8 監査ログ=%s; ', n); end if;
  select count(*) into n from cron.job where jobname in ('quarterly-reports', 'quarterly-reports-30');
  if n <> 2 then failures := failures || format('Q9 定期実行=%s; ', n); end if;

  -- 失効（A には管理者1が残る）
  update client_admins set status = 'expired' where admin_id = a2;

  -- V1 管理者1（aal2）
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*), count(*) filter (where client_id = ca) into n, i from client_quarterly_reports;
  if n <> 1 or i <> 1 then failures := failures || format('V1 見えた行=%s（自社=%s）; ', n, i); end if;
  select (select count(*) from cases) + (select count(*) from messages) + (select count(*) from case_survey_answers) into n;
  if n <> 0 then failures := failures || format('V4 相談内容が読めた(%s); ', n); end if;
  begin
    insert into client_quarterly_reports (client_id, quarter_start, members) values (ca, '2000-01-01', 0);
    failures := failures || 'V5 レポートを書けた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    perform system_generate_quarterly_reports(q, ca);
    failures := failures || 'V5 作成関数を呼べた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- V2 管理者1（aal1）
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from client_quarterly_reports;
  if n <> 0 then failures := failures || format('V2 多要素認証なしで読めた(%s); ', n); end if;
  reset role;

  -- V3 失効した管理者2（aal2）
  perform set_config('request.jwt.claims', json_build_object('sub', a2, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from client_quarterly_reports;
  if n <> 0 then failures := failures || format('V3 失効した管理者が読めた(%s); ', n); end if;
  reset role;

  if failures <> '' then
    raise exception 'client_portal FAILED: %', failures;
  end if;
  raise exception 'client_portal PASSED（テストデータは取り消されます）';
end $$;
