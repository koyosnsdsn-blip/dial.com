-- 招待コードなしの相談（ニックネームで登録した利用者）のテスト
--   N1 所属のない利用者は、サーバーが対象と判定しない限り開始できない
--   N2 対象の利用者は開始でき、利用権は「無償の付与」（往復5回・24時間・所属なし）として記録される
--   N3 同時に進められる相談は1件まで　N4 しばらくやり取りがないと自動で終了する（予定日時も本人に見える）
--   N5 企業会員の開始は、これまでどおり（引数を1つ減らした古い呼び方でも動く）
--   N6 ログイン中のブラウザ（authenticated）は、関数を呼べない
-- 最終実行：2026-10-01 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u uuid := '00000000-0000-4000-8000-0000000000a7'; mb uuid := '00000000-0000-4000-8000-0000000000a8';
  cl uuid := gen_random_uuid(); ans jsonb; r jsonb; c uuid; n int; t timestamptz; failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id, encrypted_password) values
    (u, 'nf-u@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x'),
    (mb, 'nf-m@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x');
  insert into clients (client_id, name, contract_type, status, feature_consult, rally_max, sla_hours) values (cl, 'テスト', 'corp', 'active', true, 2, 12);
  insert into accounts (account_id, email, tier, client_id) values (u, 'nf-u@test.invalid', 'free', null), (mb, 'nf-m@test.invalid', 'member', cl);
  -- 共通設問のすべてに、最初の選択肢で答える
  select jsonb_object_agg(q.survey_question_id::text, (select o.option_id::text from survey_options o where o.survey_question_id = q.survey_question_id order by o.sort_order limit 1))
  into ans from survey_questions q where q.active and q.client_id is null;

  begin
    perform user_start_case(u, ans, false, false);
    failures := failures || 'N1 対象でない利用者が開始できた; ';
  exception when others then
    if sqlerrm <> 'not_eligible' then failures := failures || format('N1 例外=%s; ', sqlerrm); end if;
  end;

  r := user_start_case(u, ans, false, true);
  c := (r ->> 'case_id')::uuid;
  select count(*) into n from cases k join entitlements e on e.entitlement_id = k.entitlement_id
  where k.case_id = c and k.client_id is null and e.source = 'payment' and e.granted_free and e.payment_id is null and e.rally_max = 5 and e.sla_hours = 24 and e.expires_at is null;
  if n <> 1 then failures := failures || 'N2 利用権の内容が違う; '; end if;
  select count(*) into n from case_survey_answers where case_id = c;
  if n < 3 then failures := failures || format('N2 アンケートの回答=%s; ', n); end if;

  begin
    perform user_start_case(u, ans, false, true);
    failures := failures || 'N3 2件目を開始できた; ';
  exception when others then
    if sqlerrm <> 'case_already_open' then failures := failures || format('N3 例外=%s; ', sqlerrm); end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select idle_close_at into t from my_cases where case_id = c;
  begin
    perform user_start_case(u, ans, false, true);
    failures := failures || 'N6 関数を呼べた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if t is null then failures := failures || 'N4 自動終了の予定日時が見えない; '; end if;
  update cases set last_activity_at = now() - interval '15 days' where case_id = c;
  perform system_close_idle_cases();
  select count(*) into n from cases where case_id = c and status = 'closed' and close_reason = 'idle';
  if n <> 1 then failures := failures || 'N4 自動で終了しない; '; end if;

  r := user_start_case(mb, ans);
  select count(*) into n from cases k join entitlements e on e.entitlement_id = k.entitlement_id
  where k.case_id = (r ->> 'case_id')::uuid and k.client_id = cl and e.source = 'client' and not e.granted_free and e.rally_max = 2 and e.sla_hours = 12;
  if n <> 1 then failures := failures || 'N5 企業会員の開始が変わった; '; end if;

  if failures <> '' then
    raise exception 'nickname_free_consult FAILED: %', failures;
  end if;
  raise exception 'nickname_free_consult PASSED（テストデータは取り消されます）';
end $$;
