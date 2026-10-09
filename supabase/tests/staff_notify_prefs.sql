-- 通知音の設定のテスト（2026-10-09）
--   N1 ブラウザ（authenticated）からは読めない・書けない
--   N2 1人につき1行（二重に作れない）。既定値は「鳴らさない」「種類はすべて鳴らす」
--   N3 相談員の登録を消すと、設定も消える
-- 最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  uid uuid := gen_random_uuid(); n int; failures text := ''; r record;
begin
  insert into auth.users (id, email, instance_id, aud, role) values (uid, 'n-test-' || uid || '@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into counselors (counselor_id, name, role) values (uid, '通知テスト', 'counselor');
  insert into staff_notify_prefs (counselor_id) values (uid);

  -- N2
  select * into r from staff_notify_prefs where counselor_id = uid;
  if r.sound_enabled or not (r.notify_message and r.notify_case and r.notify_urgent) then
    failures := failures || 'N2 既定値が違う; ';
  end if;
  begin
    insert into staff_notify_prefs (counselor_id) values (uid);
    failures := failures || 'N2 二重に作れた; ';
  exception when unique_violation then null;
  end;

  -- N1
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    select count(*) into n from staff_notify_prefs;
    failures := failures || 'N1 ブラウザから読めた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    update staff_notify_prefs set sound_enabled = true where counselor_id = uid;
    failures := failures || 'N1 ブラウザから書けた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- N3
  delete from staff_notify_prefs where counselor_id = uid;
  insert into staff_notify_prefs (counselor_id) values (uid);
  delete from auth.users where id = uid;
  select count(*) into n from staff_notify_prefs where counselor_id = uid;
  if n <> 0 then failures := failures || 'N3 設定が残った; '; end if;

  if failures <> '' then
    raise exception 'staff_notify_prefs FAILED: %', failures;
  end if;
  raise exception 'staff_notify_prefs PASSED（N1〜N3。テストデータは取り消されます）';
end $$;
