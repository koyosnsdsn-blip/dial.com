-- IP制限のテスト（2026-10-08）
--   I1 ブラウザ（authenticated）からは読めない・書けない
--   I2 拒否リストにクライアントを付けられない／許可リストはクライアントが必須
--   I3 形式が不正な値（ホスト部が0でない）は保存できない
--   I4 同じ組み合わせは二重に登録できない
-- 最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  cl uuid := gen_random_uuid(); n int; failures text := '';
begin
  insert into clients (client_id, name, contract_type, status, feature_consult, rally_max, sla_hours) values (cl, 'IPテスト', 'corp', 'active', true, 2, 12);
  insert into ip_rules (kind, cidr) values ('block', '198.51.100.7/32');
  insert into ip_rules (kind, client_id, cidr) values ('client_admin_allow', cl, '203.0.113.0/24');

  -- I1
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from ip_rules;
    failures := failures || 'I1 ブラウザから読めた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into ip_rules (kind, cidr) values ('block', '192.0.2.1/32');
    failures := failures || 'I1 ブラウザから書けた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- I2
  begin
    insert into ip_rules (kind, client_id, cidr) values ('block', cl, '192.0.2.2/32');
    failures := failures || 'I2 拒否リストにクライアントを付けられた; ';
  exception when check_violation then null;
  end;
  begin
    insert into ip_rules (kind, cidr) values ('client_admin_allow', '192.0.2.3/32');
    failures := failures || 'I2 クライアントなしの許可リストを作れた; ';
  exception when check_violation then null;
  end;

  -- I3
  begin
    insert into ip_rules (kind, cidr) values ('block', '192.168.1.1/24');
    failures := failures || 'I3 不正な形式を保存できた; ';
  exception when invalid_text_representation then null;
  end;

  -- I4
  begin
    insert into ip_rules (kind, cidr) values ('block', '198.51.100.7/32');
    failures := failures || 'I4 二重に登録できた; ';
  exception when unique_violation then null;
  end;

  if failures <> '' then
    raise exception 'ip_rules FAILED: %', failures;
  end if;
  raise exception 'ip_rules PASSED（テストデータは取り消されます）';
end $$;
