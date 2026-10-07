-- 無償の個人の相談と、企業枠の相談の並行、および本人による終了のテスト（2026-10-07）
--   P1 所属のない無償の利用者は、対応中の相談があるあいだ、もう1件の無償を始められない（従来どおり）
--   P2 企業会員になった後は、無償の相談が対応中でも、企業枠の相談を始められる（無償1件＋企業枠1件）
--   P3 企業枠の相談は、対応中なら2件目を始められない／無償を新たに始めることもできない
--   P4 本人は、自分の対応中の相談を終了できる（close_reason = user）。他人の相談・終了済みの相談は終了できない
--   P5 終了すると、同じ枠で新しい相談を始められる
--   P6 本人向けのビュー my_cases に slot が出る。ログイン中のブラウザ（authenticated）は終了関数を呼べない
--   P7 既存の相談の枠は、無償の付与なら free、企業枠なら main に振り分けられている
-- 最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u uuid := '00000000-0000-4000-8000-0000000000b1'; other uuid := '00000000-0000-4000-8000-0000000000b2';
  cl uuid := gen_random_uuid(); ans jsonb; r jsonb; c_free uuid; c_main uuid; c_main2 uuid; n int; s text; failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id, encrypted_password) values
    (u, 'pf-u@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x'),
    (other, 'pf-o@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x');
  insert into clients (client_id, name, contract_type, status, feature_consult, rally_max, sla_hours) values (cl, 'テスト', 'corp', 'active', true, 2, 12);
  insert into accounts (account_id, email, tier, client_id) values (u, 'pf-u@test.invalid', 'free', null), (other, 'pf-o@test.invalid', 'free', null);
  select jsonb_object_agg(q.survey_question_id::text, (select o.option_id::text from survey_options o where o.survey_question_id = q.survey_question_id order by o.sort_order limit 1))
  into ans from survey_questions q where q.active and q.client_id is null;

  -- P1
  r := user_start_case(u, ans, false, true);
  c_free := (r ->> 'case_id')::uuid;
  select slot into s from cases where case_id = c_free;
  if s <> 'free' then failures := failures || format('P1 無償の相談の枠=%s; ', s); end if;
  begin
    perform user_start_case(u, ans, false, true);
    failures := failures || 'P1 無償が2件になった; ';
  exception when others then
    if sqlerrm <> 'case_already_open' then failures := failures || format('P1 例外=%s; ', sqlerrm); end if;
  end;

  -- 招待コードで所属した（user_link_client と同じ変更）
  update accounts set client_id = cl, tier = 'member' where account_id = u;

  -- P2 無償が対応中でも、企業枠は始められる
  begin
    r := user_start_case(u, ans);
    c_main := (r ->> 'case_id')::uuid;
    select count(*) into n from cases where account_id = u and status = 'open';
    if n <> 2 then failures := failures || format('P2 対応中の件数=%s; ', n); end if;
    select slot into s from cases where case_id = c_main;
    if s <> 'main' then failures := failures || format('P2 企業枠の相談の枠=%s; ', s); end if;
  exception when others then
    failures := failures || format('P2 企業枠を始められなかった=%s; ', sqlerrm);
  end;

  -- P3 企業枠が対応中なら、2件目の企業枠は始められない
  begin
    perform user_start_case(u, ans);
    failures := failures || 'P3 企業枠が2件になった; ';
  exception when others then
    if sqlerrm <> 'case_already_open' then failures := failures || format('P3 例外=%s; ', sqlerrm); end if;
  end;
  -- DB の制約（枠ごとに対応中は1件まで）が最後の歯止めになっている
  begin
    insert into cases (entitlement_id, account_id, client_id, slot)
    select entitlement_id, account_id, client_id, 'main' from cases where case_id = c_main;
    failures := failures || 'P3 制約をすり抜けて企業枠が2件になった; ';
  exception when unique_violation then null;
  end;

  -- P4 本人は自分の対応中の相談を終了できる。他人は終了できない
  begin
    perform user_close_case(other, c_free);
    failures := failures || 'P4 他人の相談を終了できた; ';
  exception when others then
    if sqlerrm <> 'not_found' then failures := failures || format('P4 他人 例外=%s; ', sqlerrm); end if;
  end;
  perform user_close_case(u, c_free);
  select count(*) into n from cases where case_id = c_free and status = 'closed' and close_reason = 'user' and closed_at is not null and awaiting_reply_since is null;
  if n <> 1 then failures := failures || 'P4 終了の状態が違う; '; end if;
  begin
    perform user_close_case(u, c_free);
    failures := failures || 'P4 終了済みを再度終了できた; ';
  exception when others then
    if sqlerrm <> 'case_closed' then failures := failures || format('P4 再終了 例外=%s; ', sqlerrm); end if;
  end;
  -- 無償の相談が終わっても、企業枠の相談は影響を受けない
  select count(*) into n from cases where case_id = c_main and status = 'open';
  if n <> 1 then failures := failures || 'P4 企業枠の相談が巻き込まれた; '; end if;

  -- P5 企業枠を終了すると、同じ枠で新しく始められる
  perform user_close_case(u, c_main);
  begin
    r := user_start_case(u, ans);
    c_main2 := (r ->> 'case_id')::uuid;
  exception when others then
    failures := failures || format('P5 終了後に始められなかった=%s; ', sqlerrm);
  end;

  -- P6 ビューに slot が出る。ブラウザからは終了関数を呼べない
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from my_cases where case_id = c_free and slot = 'free';
  if n <> 1 then failures := failures || 'P6 ビューに slot が出ない; '; end if;
  begin
    perform user_close_case(u, c_main2);
    failures := failures || 'P6 関数を呼べた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- P7 既存の相談の枠の振り分け（無償の付与は free、それ以外は main）
  select count(*) into n from cases k join entitlements e on e.entitlement_id = k.entitlement_id where (e.granted_free and k.slot <> 'free') or (not e.granted_free and k.slot <> 'main');
  if n <> 0 then failures := failures || format('P7 枠の振り分けが合わない件数=%s; ', n); end if;

  if failures <> '' then
    raise exception 'parallel_free_and_main FAILED: %', failures;
  end if;
  raise exception 'parallel_free_and_main PASSED（テストデータは取り消されます）';
end $$;
