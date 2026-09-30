-- 退会（user_withdraw）と、削除の実行（system_purge_deleted）のテスト
--   W1 運営側のアカウントは退会にできない
--   W2 退会すると、対応中の相談が終了し、すべての相談が非表示になり、削除依頼が登録される
--   W3 accounts と Auth の識別情報（メールアドレス・パスワード・ニックネーム）が消え、ログインできなくなる。属性も消える
--   W4 二重に退会できない　　W5 他人のメッセージには影響しない
--   P1 猶予期間の前は消さない　P2 猶予期間を過ぎたら、メッセージ・回答・下書き・既読記録を消す（案件の行は残す）
--   P3 猶予期間内の案件は消さない　P4 監査ログに残る　P5 定期実行が2件登録されている
--   X1 ログイン中のブラウザ（authenticated）は、関数・下書き・問い合わせに触れない
-- 最終実行：2026-10-01 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u1 uuid := '00000000-0000-4000-8000-0000000000b1'; u2 uuid := '00000000-0000-4000-8000-0000000000b2'; st uuid := '00000000-0000-4000-8000-0000000000b3';
  cl uuid := gen_random_uuid(); e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid(); e3 uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();
  r jsonb; n int; s text; failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id, encrypted_password, raw_user_meta_data) values
    (u1, 'wd-1@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x', '{"nickname":"taro"}'),
    (u2, 'wd-2@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x', '{}'),
    (st, 'wd-s@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x', '{}');
  insert into clients (client_id, name, contract_type, status, feature_consult) values (cl, 'テスト', 'corp', 'active', true);
  insert into accounts (account_id, email, tier, client_id) values (u1, 'wd-1@test.invalid', 'member', cl), (u2, 'wd-2@test.invalid', 'free', null), (st, 'wd-s@test.invalid', 'free', null);
  insert into counselors (counselor_id, name, role) values (st, 'テスト相談員', 'counselor');
  insert into entitlements (entitlement_id, account_id, source, client_id, rally_max, sla_hours) values (e1, u1, 'client', cl, 1, 24), (e2, u1, 'client', cl, 1, 24), (e3, u2, 'payment', null, 5, 24);
  insert into cases (case_id, entitlement_id, account_id, client_id, status, close_reason, closed_at, opened_at) values (c1, e1, u1, cl, 'closed', 'rally', now(), now() - interval '2 days');
  insert into cases (case_id, entitlement_id, account_id, client_id, status, awaiting_reply_since) values (c2, e2, u1, cl, 'open', now());
  insert into cases (case_id, entitlement_id, account_id, status, close_reason, closed_at) values (c3, e3, u2, 'closed', 'manual', now());
  insert into messages (case_id, sender, body) values (c1, 'user', 'a'), (c1, 'counselor', 'b'), (c2, 'user', 'c'), (c3, 'user', 'd');
  insert into case_survey_answers (case_id, survey_question_id, kind, question_text_snapshot, option_label_snapshot) values (c1, '5e000000-0000-4000-8000-0000000000b1', 'chief', 'q', 'a');
  insert into account_attributes (account_id, survey_question_id, question_text_snapshot, option_label_snapshot) values (u1, '5e000000-0000-4000-8000-0000000000a1', 'q', '30代');
  insert into reply_drafts (case_id, counselor_id, body) values (c1, st, '下書き');
  insert into case_reads (case_id) values (c1);

  begin
    perform user_withdraw(st);
    failures := failures || 'W1 運営側のアカウントを退会にできた; ';
  exception when others then
    if sqlerrm <> 'staff_account' then failures := failures || format('W1 例外=%s; ', sqlerrm); end if;
  end;
  r := user_withdraw(u1);
  if (r ->> 'cases')::int <> 2 then failures := failures || format('W2 cases=%s; ', r ->> 'cases'); end if;
  select count(*) into n from cases where account_id = u1 and status = 'open';
  if n <> 0 then failures := failures || 'W2 対応中の相談が残った; '; end if;
  select count(*) into n from messages m join cases c using (case_id) where c.account_id = u1 and m.hidden_at is null;
  if n <> 0 then failures := failures || 'W2 非表示になっていないメッセージがある; '; end if;
  select count(*) into n from deletion_requests where account_id = u1 and execution_status = 'pending';
  if n <> 2 then failures := failures || format('W2 削除依頼=%s; ', n); end if;
  select count(*) into n from accounts where account_id = u1 and deleted_at is not null and email is null and client_id is null and tier = 'free';
  if n <> 1 then failures := failures || 'W3 accounts の識別情報が残った; '; end if;
  select count(*) into n from account_attributes where account_id = u1;
  if n <> 0 then failures := failures || 'W3 属性が残った; '; end if;
  select email into s from auth.users where id = u1;
  if s not like 'deleted-%' then failures := failures || format('W3 auth email=%s; ', s); end if;
  select count(*) into n from auth.users where id = u1 and encrypted_password is null and raw_user_meta_data = '{}'::jsonb and banned_until > now() + interval '100 years';
  if n <> 1 then failures := failures || 'W3 auth の識別情報・ログインが残った; '; end if;
  begin
    perform user_withdraw(u1);
    failures := failures || 'W4 二重に退会できた; ';
  exception when others then
    if sqlerrm <> 'not_found' then failures := failures || format('W4 例外=%s; ', sqlerrm); end if;
  end;
  select count(*) into n from messages where case_id = c3 and hidden_at is null;
  if n <> 1 then failures := failures || 'W5 他人のメッセージまで非表示になった; '; end if;

  r := system_purge_deleted();
  select count(*) into n from messages where case_id in (c1, c2);
  if n <> 3 then failures := failures || format('P1 猶予期間の前に消えた(%s); ', n); end if;
  update deletion_requests set purge_after = now() - interval '1 minute' where target_id = c1;
  r := system_purge_deleted();
  if (r ->> 'done')::int < 1 then failures := failures || format('P2 done=%s; ', r ->> 'done'); end if;
  select (select count(*) from messages where case_id = c1) + (select count(*) from case_survey_answers where case_id = c1) + (select count(*) from reply_drafts where case_id = c1) + (select count(*) from case_reads where case_id = c1) into n;
  if n <> 0 then failures := failures || format('P2 残り=%s; ', n); end if;
  select count(*) into n from cases where case_id = c1;
  if n <> 1 then failures := failures || 'P2 案件の行まで消えた; '; end if;
  select count(*) into n from deletion_requests where target_id = c1 and execution_status = 'done' and executed_at is not null;
  if n <> 1 then failures := failures || 'P2 実行結果が記録されていない; '; end if;
  select count(*) into n from messages where case_id = c2;
  if n <> 1 then failures := failures || 'P3 猶予期間内の案件まで消えた; '; end if;
  select count(*) into n from audit_logs where action = 'case.purge' and target_id = c1;
  if n <> 1 then failures := failures || 'P4 監査ログがない; '; end if;
  select count(*) into n from cron.job where jobname in ('purge-deleted', 'close-idle-cases') and active;
  if n <> 2 then failures := failures || format('P5 cron=%s; ', n); end if;

  set local role authenticated;
  begin perform user_withdraw(u2); failures := failures || 'X1 authenticatedが退会関数を呼べた; '; exception when insufficient_privilege then null; end;
  begin select count(*) into n from reply_drafts; failures := failures || 'X1 authenticatedが下書きを読めた; '; exception when insufficient_privilege then null; end;
  begin select count(*) into n from inquiries; failures := failures || 'X1 authenticatedが問い合わせを読めた; '; exception when insufficient_privilege then null; end;
  reset role;

  if failures = '' then raise exception 'OPS TEST PASSED（W1〜W5・P1〜P5・X1。取り消し済み）';
  else raise exception 'OPS TEST FAILED: %', failures; end if;
end $$;
