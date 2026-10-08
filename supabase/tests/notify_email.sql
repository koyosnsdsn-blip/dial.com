-- 通知用メールアドレスのテスト（2026-10-08）
--   N1 ブラウザ（authenticated）からは読めない・書けない
--   N2 形式が不正なアドレスは保存できない
--   N3 退会すると削除される
-- 最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u uuid := '00000000-0000-4000-8000-0000000000d1'; n int; failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id, encrypted_password)
  values (u, 'ne-u@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x');
  insert into accounts (account_id, email, tier, client_id) values (u, 'ne-u@test.invalid', 'free', null);
  insert into account_notify_emails (account_id, email) values (u, 'me@example.com');

  -- N1
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from account_notify_emails;
    failures := failures || 'N1 ブラウザから読めた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    update account_notify_emails set email = 'x@example.com' where account_id = u;
    failures := failures || 'N1 ブラウザから書けた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- N2
  begin
    update account_notify_emails set email = 'not-an-email' where account_id = u;
    failures := failures || 'N2 不正な形式を保存できた; ';
  exception when check_violation then null;
  end;

  -- N3
  update accounts set deleted_at = now() where account_id = u;
  select count(*) into n from account_notify_emails where account_id = u;
  if n <> 0 then failures := failures || 'N3 退会後も残っている; '; end if;

  if failures <> '' then
    raise exception 'notify_email FAILED: %', failures;
  end if;
  raise exception 'notify_email PASSED（テストデータは取り消されます）';
end $$;
