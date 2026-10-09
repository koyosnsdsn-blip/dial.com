-- 先生コメントの追加分のテスト（2026-10-09。20261009100000_experts_followup.sql）
--   Y1 一時非公開（unpublished_at）の質問は、先生に見えず、コメントも作れない
--   Y2 先生の連絡先メールアドレスは、大文字小文字を区別せず重複できない
-- 最後に必ず例外を投げて取り消す。成功時のメッセージ： "experts_followup PASSED ..."
do $$
declare
  u_ex1 uuid := '00000000-0000-4000-8000-0000000000f1';
  u_ex2 uuid := '00000000-0000-4000-8000-0000000000f2';
  u_acc uuid := '00000000-0000-4000-8000-0000000000f4';
  g1    uuid := gen_random_uuid();
  q_ok  uuid := gen_random_uuid();
  q_unp uuid := gen_random_uuid();
  n     int;
  failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (u_ex1, 'fx1@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_ex2, 'fx2@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_acc, 'fa@test.invalid',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into accounts (account_id, email) values (u_acc, 'fa@test.invalid');
  insert into genres (genre_id, name) values (g1, 'テストジャンル');
  insert into experts (expert_id, display_name, qualification, contact_email) values (u_ex1, '先生1', '臨床心理士', 'Sensei@Example.com');
  insert into expert_genres (expert_id, genre_id) values (u_ex1, g1);
  insert into questions (question_id, account_id, display_id, genre_id, body, status, published_at) values
    (q_ok,  u_acc, 'yf-ok',  g1, '公開中', 'published', now()),
    (q_unp, u_acc, 'yf-unp', g1, '一時非公開', 'published', now());
  update questions set unpublished_at = now() where question_id = q_unp;

  -- Y1
  perform set_config('request.jwt.claims', json_build_object('sub', u_ex1, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from expert_visible_questions();
  if n <> 1 then failures := failures || format('Y1 先生に見える質問が %s 件（期待 1）; ', n); end if;
  select count(*) into n from expert_visible_questions() where question_id = q_unp;
  if n <> 0 then failures := failures || 'Y1 一時非公開の質問が見えた; '; end if;
  reset role;
  begin
    insert into expert_comments (question_id, expert_id, body) values (q_unp, u_ex1, 'コメント');
    failures := failures || 'Y1 一時非公開の質問にコメントを作れた; ';
  exception when raise_exception then null;
  end;
  insert into expert_comments (question_id, expert_id, body) values (q_ok, u_ex1, 'コメント');

  -- Y2
  begin
    insert into experts (expert_id, display_name, qualification, contact_email) values (u_ex2, '先生2', '弁護士', 'sensei@example.com');
    failures := failures || 'Y2 同じ連絡先で先生を作れた; ';
  exception when unique_violation then null;
  end;

  if failures <> '' then
    raise exception 'experts_followup FAILED: %', failures;
  end if;
  raise exception 'experts_followup PASSED（Y1・Y2。テストデータは取り消されます）';
end $$;
