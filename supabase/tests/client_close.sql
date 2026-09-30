-- 契約終了（admin_close_client）のテスト
--   C1 所属する全アカウントの所属が解除され、無料会員になる。別のクライアントの所属は変わらない
--   C2 対応中の相談は継続し、契約終了後も送信できる
--   C3 終了したクライアントの招待コードは使えない
--   C4 終了済みのクライアントを二重に終了できない
--   C5 ログイン中のブラウザ（authenticated）からは呼べない
-- 最終実行：2026-09-30 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u1 uuid := '00000000-0000-4000-8000-0000000000c1';
  u2 uuid := '00000000-0000-4000-8000-0000000000c2';
  cl uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  r jsonb; n int; c1 uuid; failures text := '';
  ans jsonb := '{"5e000000-0000-4000-8000-0000000000a1":"5e000000-0000-4000-8000-00000000a102","5e000000-0000-4000-8000-0000000000a2":"5e000000-0000-4000-8000-00000000a299","5e000000-0000-4000-8000-0000000000b1":"5e000000-0000-4000-8000-00000000b101","5e000000-0000-4000-8000-0000000000b2":"5e000000-0000-4000-8000-00000000b204","5e000000-0000-4000-8000-0000000000b3":"5e000000-0000-4000-8000-00000000b301"}';
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (u1, 'cm-1@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u2, 'cm-2@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into clients (client_id, name, contract_type, status, invite_code, feature_consult) values
    (cl, 'テスト終了対象', 'corp', 'active', 'CM-TEST-1', true), (other, 'テスト別', 'corp', 'active', 'CM-TEST-2', true);
  insert into accounts (account_id, email) values (u1, 'cm-1@test.invalid'), (u2, 'cm-2@test.invalid');
  perform user_link_client(u1, 'CM-TEST-1');
  perform user_link_client(u2, 'CM-TEST-2');
  c1 := (user_start_case(u1, ans) ->> 'case_id')::uuid;

  r := admin_close_client(cl);
  if (r ->> 'detached')::int <> 1 then failures := failures || format('C1 detached=%s(期待1); ', r ->> 'detached'); end if;
  select count(*) into n from accounts where account_id = u1 and client_id is null and tier = 'free';
  if n <> 1 then failures := failures || 'C1 所属が解除されていない; '; end if;
  select count(*) into n from accounts where account_id = u2 and client_id = other and tier = 'member';
  if n <> 1 then failures := failures || 'C1 別クライアントの所属まで解除された; '; end if;
  select count(*) into n from cases where case_id = c1 and status = 'open' and client_id = cl;
  if n <> 1 then failures := failures || 'C2 対応中の相談が継続していない; '; end if;
  perform user_send_message(u1, c1, '契約終了後も送信できる');
  begin
    perform user_link_client(u1, 'CM-TEST-1');
    failures := failures || 'C3 終了したクライアントのコードが通った; ';
  exception when others then
    if sqlerrm <> 'invalid_code' then failures := failures || format('C3 例外=%s; ', sqlerrm); end if;
  end;
  begin
    perform admin_close_client(cl);
    failures := failures || 'C4 二重に終了できた; ';
  exception when others then
    if sqlerrm <> 'already_closed' then failures := failures || format('C4 例外=%s; ', sqlerrm); end if;
  end;
  set local role authenticated;
  begin
    perform admin_close_client(other);
    failures := failures || 'C5 authenticatedが呼べた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  if failures = '' then raise exception 'CLIENT CLOSE TEST PASSED（C1〜C5。取り消し済み）';
  else raise exception 'CLIENT CLOSE TEST FAILED: %', failures; end if;
end $$;
