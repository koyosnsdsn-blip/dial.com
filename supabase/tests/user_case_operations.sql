-- 相談者側のDB関数のテスト（user_link_client / user_start_case / user_send_message）
--
-- 確認すること：
--   U1  招待コード：誤ったコード・「準備中」クライアントのコードは拒否。有効なクライアントのコードで所属が付く
--   U2  所属のない利用者は相談を開始できない。アンケートが未回答だと開始できず、利用権も残らない
--   U3  開始：利用権にクライアント設定が複写される。回答が複写保存される。対応中の案件が最も少ない相談員に割り当てる
--   U4  有効な案件がある間は、2件目を開始できない
--   U5  送信：他人の案件には送れない。最初の送信で返信待ちの起点が入り、2通目では変わらない
--   U6  2回目以降は主訴のみで開始でき、前回の担当が優先される。属性は案件へ複写される
--   U7  前回の担当が不在のときは、別の相談員に割り当てる
--   U8  自治体委託型は同意がないと開始できない。同意すると記録が残る
--   U9  ログイン中のブラウザ（authenticated）からは関数を直接呼べない
--
-- 実行方法：このファイル全体をそのまま実行する（Supabase の SQL Editor、または MCP の execute_sql）。
-- 最後に必ず例外を投げてトランザクションごと取り消すため、テストデータは DB に残らない。
--   成功時のメッセージ： "USER OPS TEST PASSED ..."
--   失敗時のメッセージ： "USER OPS TEST FAILED: ..."

do $$
declare
  u_a     uuid := '00000000-0000-4000-8000-0000000000a1';  -- 相談員A（対応中1件）
  u_b     uuid := '00000000-0000-4000-8000-0000000000a2';  -- 相談員B（対応中0件）
  u_1     uuid := '00000000-0000-4000-8000-0000000000a3';  -- 利用者1
  u_2     uuid := '00000000-0000-4000-8000-0000000000a4';  -- 利用者2（Aの既存案件の持ち主。所属なし）
  u_3     uuid := '00000000-0000-4000-8000-0000000000a5';  -- 利用者3（自治体委託型）
  cl_ok   uuid := gen_random_uuid();
  cl_prep uuid := gen_random_uuid();
  cl_muni uuid := gen_random_uuid();
  e_x     uuid := gen_random_uuid();
  full_answers  jsonb := '{
    "5e000000-0000-4000-8000-0000000000a1": "5e000000-0000-4000-8000-00000000a102",
    "5e000000-0000-4000-8000-0000000000a2": "5e000000-0000-4000-8000-00000000a299",
    "5e000000-0000-4000-8000-0000000000b1": "5e000000-0000-4000-8000-00000000b101",
    "5e000000-0000-4000-8000-0000000000b2": "5e000000-0000-4000-8000-00000000b204",
    "5e000000-0000-4000-8000-0000000000b3": "5e000000-0000-4000-8000-00000000b301"}';
  chief_answers jsonb := '{
    "5e000000-0000-4000-8000-0000000000b1": "5e000000-0000-4000-8000-00000000b102",
    "5e000000-0000-4000-8000-0000000000b2": "5e000000-0000-4000-8000-00000000b299",
    "5e000000-0000-4000-8000-0000000000b3": "5e000000-0000-4000-8000-00000000b303"}';
  r        jsonb;
  c1       uuid;
  c2       uuid;
  c3       uuid;
  n        int;
  t        timestamptz;
  v_case   cases%rowtype;
  failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (u_a, 'uop-a@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_b, 'uop-b@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_1, 'uop-1@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_2, 'uop-2@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_3, 'uop-3@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into counselors (counselor_id, name, role) values (u_a, 'テスト相談員A', 'counselor'), (u_b, 'テスト相談員B', 'counselor');
  insert into clients (client_id, name, contract_type, status, invite_code, feature_consult, rally_max, sla_hours) values
    (cl_ok,   'テスト有効',   'corp', 'active', 'TESTCODE-OK',   true, 1, 12),
    (cl_prep, 'テスト準備中', 'corp', 'prep',   'TESTCODE-PREP', true, 1, 24),
    (cl_muni, 'テスト自治体', 'muni', 'active', 'TESTCODE-MUNI', true, 2, 24);
  insert into accounts (account_id, email) values (u_1, 'uop-1@test.invalid'), (u_2, 'uop-2@test.invalid'), (u_3, 'uop-3@test.invalid');
  -- 相談員Aに対応中の案件を1件持たせる
  insert into entitlements (entitlement_id, account_id, source, rally_max, sla_hours) values (e_x, u_2, 'payment', 5, 24);
  insert into cases (entitlement_id, account_id, counselor_id) values (e_x, u_2, u_a);

  -- U1 招待コード
  begin
    perform user_link_client(u_1, 'NO-SUCH-CODE');
    failures := failures || 'U1 誤ったコードが通った; ';
  exception when others then
    if sqlerrm <> 'invalid_code' then failures := failures || format('U1 誤コードの例外=%s; ', sqlerrm); end if;
  end;
  begin
    perform user_link_client(u_1, 'TESTCODE-PREP');
    failures := failures || 'U1 準備中クライアントのコードが通った; ';
  exception when others then
    if sqlerrm <> 'invalid_code' then failures := failures || format('U1 準備中の例外=%s; ', sqlerrm); end if;
  end;

  -- U2 所属なしでは開始できない
  begin
    perform user_start_case(u_1, full_answers);
    failures := failures || 'U2 所属なしで開始できた; ';
  exception when others then
    if sqlerrm <> 'not_eligible' then failures := failures || format('U2 所属なしの例外=%s; ', sqlerrm); end if;
  end;

  perform user_link_client(u_1, ' TESTCODE-OK ');
  select count(*) into n from accounts where account_id = u_1 and client_id = cl_ok and tier = 'member';
  if n <> 1 then failures := failures || 'U1 所属が付かなかった; '; end if;

  -- U2 アンケート未回答（主訴のみ＝属性が足りない）
  begin
    perform user_start_case(u_1, chief_answers);
    failures := failures || 'U2 属性未回答で開始できた; ';
  exception when others then
    if sqlerrm <> 'survey_incomplete' then failures := failures || format('U2 未回答の例外=%s; ', sqlerrm); end if;
  end;
  -- 別の設問の選択肢を指定しても通らない
  begin
    perform user_start_case(u_1, full_answers || '{"5e000000-0000-4000-8000-0000000000b3": "5e000000-0000-4000-8000-00000000b101"}');
    failures := failures || 'U2 別設問の選択肢で開始できた; ';
  exception when others then
    if sqlerrm <> 'survey_incomplete' then failures := failures || format('U2 別設問の例外=%s; ', sqlerrm); end if;
  end;
  select count(*) into n from entitlements where account_id = u_1;
  if n <> 0 then failures := failures || format('U2 失敗した開始の利用権が残った(%s件); ', n); end if;

  -- U3 開始
  r := user_start_case(u_1, full_answers);
  c1 := (r ->> 'case_id')::uuid;
  select * into v_case from cases where case_id = c1;
  if v_case.counselor_id is distinct from u_b then failures := failures || 'U3 負荷の少ない相談員Bに割り当たらなかった; '; end if;
  if v_case.client_id is distinct from cl_ok or v_case.awaiting_reply_since is not null then failures := failures || 'U3 案件の初期値が違う; '; end if;
  select count(*) into n from entitlements e where e.entitlement_id = v_case.entitlement_id and e.source = 'client' and e.rally_max = 1 and e.sla_hours = 12 and e.client_id = cl_ok;
  if n <> 1 then failures := failures || 'U3 利用権にクライアント設定が複写されていない; '; end if;
  select count(*) into n from case_survey_answers where case_id = c1;
  if n <> 5 then failures := failures || format('U3 案件の回答=%s(期待5); ', n); end if;
  select count(*) into n from case_survey_answers where case_id = c1 and kind = 'chief' and option_label_snapshot = 'すぐに話したい';
  if n <> 1 then failures := failures || 'U3 選択肢ラベルが複写されていない; '; end if;
  select count(*) into n from account_attributes where account_id = u_1;
  if n <> 2 then failures := failures || format('U3 属性=%s(期待2); ', n); end if;

  -- U4 2件目は開始できない
  begin
    perform user_start_case(u_1, chief_answers);
    failures := failures || 'U4 有効な案件があるのに開始できた; ';
  exception when others then
    if sqlerrm <> 'case_already_open' then failures := failures || format('U4 例外=%s; ', sqlerrm); end if;
  end;

  -- U5 送信
  begin
    perform user_send_message(u_2, c1, '他人の案件への送信');
    failures := failures || 'U5 他人の案件に送信できた; ';
  exception when others then
    if sqlerrm <> 'not_found' then failures := failures || format('U5 他人の例外=%s; ', sqlerrm); end if;
  end;
  begin
    perform user_send_message(u_1, c1, '   ');
    failures := failures || 'U5 空の本文を送信できた; ';
  exception when others then
    if sqlerrm <> 'empty_body' then failures := failures || format('U5 空本文の例外=%s; ', sqlerrm); end if;
  end;
  r := user_send_message(u_1, c1, '1通目');
  if (r ->> 'first')::boolean is not true then failures := failures || 'U5 1通目がfirstでない; '; end if;
  select awaiting_reply_since into t from cases where case_id = c1;
  if t is null then failures := failures || 'U5 返信待ちの起点が入らない; '; end if;
  update cases set awaiting_reply_since = t - interval '1 hour' where case_id = c1;
  r := user_send_message(u_1, c1, '2通目');
  if (r ->> 'first')::boolean is not false then failures := failures || 'U5 2通目がfirstになった; '; end if;
  select count(*) into n from cases where case_id = c1 and awaiting_reply_since = t - interval '1 hour' and rally_used = 0;
  if n <> 1 then failures := failures || 'U5 2通目で起点が変わった、または往復を消費した; '; end if;

  -- U6 相談員の返信で上限（1回）に達して終了 → 主訴のみで再開、前回の担当（B）を優先
  perform staff_send_reply(c1, '返信');
  select count(*) into n from cases where case_id = c1 and status = 'closed' and close_reason = 'rally';
  if n <> 1 then failures := failures || 'U6 上限到達で終了しなかった; '; end if;
  begin
    perform user_send_message(u_1, c1, '終了後の送信');
    failures := failures || 'U6 終了した案件に送信できた; ';
  exception when others then
    if sqlerrm <> 'case_closed' then failures := failures || format('U6 終了後送信の例外=%s; ', sqlerrm); end if;
  end;
  -- 相談員Aの負荷を0にしても、前回の担当Bが優先される
  update cases set status = 'closed', close_reason = 'manual', closed_at = now() where counselor_id = u_a and status = 'open';
  r := user_start_case(u_1, chief_answers);
  c2 := (r ->> 'case_id')::uuid;
  select * into v_case from cases where case_id = c2;
  if v_case.counselor_id is distinct from u_b then failures := failures || 'U6 前回の担当が優先されなかった; '; end if;
  select count(*) into n from case_survey_answers where case_id = c2;
  if n <> 5 then failures := failures || format('U6 2回目の回答=%s(期待5：主訴3＋属性の複写2); ', n); end if;
  select count(*) into n from case_survey_answers where case_id = c2 and kind = 'attr' and option_label_snapshot in ('30代', '答えない');
  if n <> 2 then failures := failures || 'U6 属性が複写されていない; '; end if;

  -- U7 前回の担当が不在 → 別の相談員
  perform staff_close_case(c2);
  update counselors set absent_from = (now() at time zone 'Asia/Tokyo')::date - 1, absent_to = (now() at time zone 'Asia/Tokyo')::date + 1 where counselor_id = u_b;
  r := user_start_case(u_1, chief_answers);
  c3 := (r ->> 'case_id')::uuid;
  select * into v_case from cases where case_id = c3;
  if v_case.counselor_id is distinct from u_a then failures := failures || 'U7 不在の相談員を避けなかった; '; end if;

  -- U8 自治体委託型
  perform user_link_client(u_3, 'TESTCODE-MUNI');
  begin
    perform user_start_case(u_3, full_answers, false);
    failures := failures || 'U8 同意なしで開始できた; ';
  exception when others then
    if sqlerrm <> 'consent_required' then failures := failures || format('U8 例外=%s; ', sqlerrm); end if;
  end;
  perform user_start_case(u_3, full_answers, true);
  select count(*) into n from consents where account_id = u_3 and doc_type = 'muni_report';
  if n <> 1 then failures := failures || 'U8 同意が記録されていない; '; end if;

  -- U9 ブラウザの権限では呼べない
  perform set_config('request.jwt.claims', json_build_object('sub', u_1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    perform user_send_message(u_1, c3, '直接呼び出し');
    failures := failures || 'U9 authenticatedが関数を呼べた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    perform user_link_client(u_1, 'TESTCODE-OK');
    failures := failures || 'U9 authenticatedが招待コード関数を呼べた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from survey_questions;
    failures := failures || 'U9 authenticatedが設問テーブルを直接読めた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  if failures = '' then
    raise exception 'USER OPS TEST PASSED（U1〜U9。テストデータは取り消し済み）';
  else
    raise exception 'USER OPS TEST FAILED: %', failures;
  end if;
end
$$;
