-- クライアント別の追加設問のテスト（要件 3.11.8）
--   S1 追加設問のあるクライアントの利用者は、追加設問にも答えないと相談を開始できない。回答は案件に複写される
--   S2 他のクライアントの利用者には、その追加設問は要求されない
--   S3 有効な追加設問は1クライアントにつき2問まで
--   S4 設問を取り下げると新しい設問を追加でき、過去の回答は設問文とともに残る
-- 最終実行：2026-09-30 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u1 uuid := '00000000-0000-4000-8000-0000000000e1';
  u2 uuid := '00000000-0000-4000-8000-0000000000e2';
  cl uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  q1 uuid := gen_random_uuid(); q2 uuid := gen_random_uuid(); o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid();
  base jsonb := '{"5e000000-0000-4000-8000-0000000000a1":"5e000000-0000-4000-8000-00000000a102","5e000000-0000-4000-8000-0000000000a2":"5e000000-0000-4000-8000-00000000a299","5e000000-0000-4000-8000-0000000000b1":"5e000000-0000-4000-8000-00000000b101","5e000000-0000-4000-8000-0000000000b2":"5e000000-0000-4000-8000-00000000b204","5e000000-0000-4000-8000-0000000000b3":"5e000000-0000-4000-8000-00000000b301"}';
  c1 uuid; n int; failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (u1, 'sv-1@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u2, 'sv-2@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into clients (client_id, name, contract_type, status, invite_code, feature_consult) values
    (cl, 'テスト設問あり', 'corp', 'active', 'SV-TEST-1', true), (other, 'テスト設問なし', 'corp', 'active', 'SV-TEST-2', true);
  insert into accounts (account_id, email) values (u1, 'sv-1@test.invalid'), (u2, 'sv-2@test.invalid');
  perform user_link_client(u1, 'SV-TEST-1'); perform user_link_client(u2, 'SV-TEST-2');
  insert into survey_questions (survey_question_id, client_id, kind, question_text, sort_order) values
    (q1, cl, 'chief', '追加設問1', 100), (q2, cl, 'attr', '追加設問2', 110);
  insert into survey_options (option_id, survey_question_id, label, sort_order) values (o1, q1, 'はい', 10), (o2, q2, '答えない', 990);

  begin
    perform user_start_case(u1, base);
    failures := failures || 'S1 追加設問が未回答でも開始できた; ';
  exception when others then
    if sqlerrm <> 'survey_incomplete' then failures := failures || format('S1 例外=%s; ', sqlerrm); end if;
  end;
  c1 := (user_start_case(u1, base || jsonb_build_object(q1::text, o1::text, q2::text, o2::text)) ->> 'case_id')::uuid;
  select count(*) into n from case_survey_answers where case_id = c1;
  if n <> 7 then failures := failures || format('S1 回答=%s(期待7); ', n); end if;
  perform user_start_case(u2, base);
  begin
    insert into survey_questions (client_id, kind, question_text) values (cl, 'chief', '3問目');
    failures := failures || 'S3 3問目を追加できた; ';
  exception when others then
    if sqlerrm not like '%already has 2 active%' then failures := failures || format('S3 例外=%s; ', sqlerrm); end if;
  end;
  update survey_questions set active = false where survey_question_id = q1;
  insert into survey_questions (client_id, kind, question_text) values (cl, 'chief', '差し替え');
  select count(*) into n from case_survey_answers where case_id = c1 and survey_question_id = q1 and question_text_snapshot = '追加設問1';
  if n <> 1 then failures := failures || 'S4 過去の回答が残っていない; '; end if;

  if failures = '' then raise exception 'SURVEY TEST PASSED（S1〜S4。取り消し済み）';
  else raise exception 'SURVEY TEST FAILED: %', failures; end if;
end $$;
