-- 先生コメントの追加機能のテスト（2026-10-09。20261009110000_expert_comment_extras.sql）
--   Z1 通報：公開中のコメントにだけできる。同じ利用者の二重通報は拒否。未対応の通報が閾値に達したら自動で非表示
--   Z2 「参考になった」：付ける・外す・二重に付けても1件。公開中でないコメントには付けられない
--   Z3 退会すると、通報者の紐づけが外れ、「参考になった」が消える
--   Z4 ブラウザ（authenticated）からは、どちらの表も読めず、関数も呼べない
-- 最後に必ず例外を投げて取り消す。成功時のメッセージ： "expert_comment_extras PASSED ..."
do $$
declare
  u_ex  uuid := '00000000-0000-4000-8000-0000000000a1';
  u_a1  uuid := '00000000-0000-4000-8000-0000000000a2';
  u_a2  uuid := '00000000-0000-4000-8000-0000000000a3';
  u_a3  uuid := '00000000-0000-4000-8000-0000000000a4';
  u_cn  uuid := '00000000-0000-4000-8000-0000000000a5';
  g1    uuid := gen_random_uuid();
  q1    uuid := gen_random_uuid();
  q2    uuid := gen_random_uuid();
  cm    uuid := gen_random_uuid();
  cm_dr uuid := gen_random_uuid();
  r     jsonb;
  n     int;
  s     text;
  failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id)
  select x, x::text || '@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
  from unnest(array[u_ex, u_a1, u_a2, u_a3, u_cn]) x;
  insert into accounts (account_id, email) values (u_a1, 'a1@test.invalid'), (u_a2, 'a2@test.invalid'), (u_a3, 'a3@test.invalid');
  insert into counselors (counselor_id, name, role) values (u_cn, 'テスト相談員', 'counselor');
  insert into genres (genre_id, name) values (g1, 'テストジャンル');
  insert into experts (expert_id, display_name, qualification) values (u_ex, 'テスト先生', '臨床心理士');
  insert into expert_genres (expert_id, genre_id) values (u_ex, g1);
  insert into questions (question_id, account_id, display_id, genre_id, body, status, published_at) values
    (q1, u_a1, 'ze-1', g1, '公開中の質問', 'published', now()),
    (q2, u_a1, 'ze-2', g1, '公開中の質問2', 'published', now());
  insert into expert_comments (comment_id, question_id, expert_id, body) values (cm, q1, u_ex, 'コメント'), (cm_dr, q2, u_ex, '下書き');
  update expert_comments set status = 'pending' where comment_id = cm;
  update expert_comments set status = 'published', reviewed_by = u_cn where comment_id = cm;
  insert into system_settings (setting_key, setting_value) values ('qa_report_auto_hide', '2')
  on conflict (setting_key) do update set setting_value = '2';

  -- ---------- Z1：通報 ----------
  begin
    perform user_report_expert_comment(u_a1, cm_dr, 'other');
    failures := failures || 'Z1 下書きのコメントを通報できた; ';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform user_report_expert_comment(u_a1, cm, 'bogus');
    failures := failures || 'Z1 不正な区分で通報できた; ';
  exception when sqlstate '22023' then null;
  end;
  r := user_report_expert_comment(u_a1, cm, 'inappropriate');
  if (r ->> 'auto_hidden')::boolean then failures := failures || 'Z1 1件目で自動非表示になった; '; end if;
  begin
    perform user_report_expert_comment(u_a1, cm, 'other');
    failures := failures || 'Z1 二重に通報できた; ';
  exception when sqlstate '22023' then null;
  end;
  select status into s from expert_comments where comment_id = cm;
  if s <> 'published' then failures := failures || 'Z1 閾値前に非表示になった; '; end if;
  r := user_report_expert_comment(u_a2, cm, 'identifiable');
  if not (r ->> 'auto_hidden')::boolean then failures := failures || 'Z1 閾値(2件)で自動非表示にならなかった; '; end if;
  select status into s from expert_comments where comment_id = cm;
  if s <> 'hidden' then failures := failures || format('Z1 コメントの状態が %s（期待 hidden）; ', s); end if;
  select count(*) into n from expert_comments where comment_id = cm and hidden_at is not null;
  if n <> 1 then failures := failures || 'Z1 hidden_at が入らなかった; '; end if;
  begin
    perform user_report_expert_comment(u_a3, cm, 'other');
    failures := failures || 'Z1 非表示のコメントを通報できた; ';
  exception when sqlstate 'P0002' then null;
  end;
  -- 相談員が再公開できる（確認者は残っているため）
  update expert_comments set status = 'published', reviewed_by = u_cn where comment_id = cm;
  select status into s from expert_comments where comment_id = cm;
  if s <> 'published' then failures := failures || 'Z1 再公開できなかった; '; end if;

  -- ---------- Z2：参考になった ----------
  r := user_set_comment_helpful(u_a1, cm, true);
  r := user_set_comment_helpful(u_a1, cm, true);
  if (r ->> 'count')::int <> 1 then failures := failures || 'Z2 二重に付けて件数が 1 でない; '; end if;
  r := user_set_comment_helpful(u_a2, cm, true);
  if (r ->> 'count')::int <> 2 then failures := failures || 'Z2 2人目で件数が 2 でない; '; end if;
  r := user_set_comment_helpful(u_a2, cm, false);
  if (r ->> 'count')::int <> 1 then failures := failures || 'Z2 外して件数が 1 に戻らない; '; end if;
  begin
    perform user_set_comment_helpful(u_a1, cm_dr, true);
    failures := failures || 'Z2 下書きのコメントに付けられた; ';
  exception when sqlstate 'P0002' then null;
  end;

  -- ---------- Z3：退会 ----------
  update accounts set deleted_at = now() where account_id = u_a1;
  select count(*) into n from expert_comment_reports where reporter_account_id = u_a1;
  if n <> 0 then failures := failures || 'Z3 退会後も通報者の紐づけが残った; '; end if;
  select count(*) into n from expert_comment_reports where comment_id = cm;
  if n <> 2 then failures := failures || 'Z3 通報そのものが消えた; '; end if;
  select count(*) into n from expert_comment_helpful where account_id = u_a1;
  if n <> 0 then failures := failures || 'Z3 退会後も「参考になった」が残った; '; end if;

  -- ---------- Z4：ブラウザからは触れない ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_a2, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    perform count(*) from expert_comment_reports;
    failures := failures || 'Z4 通報の表を読めた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from expert_comment_helpful;
    failures := failures || 'Z4 「参考になった」の表を読めた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    perform user_report_expert_comment(u_a2, cm, 'other');
    failures := failures || 'Z4 通報の関数を呼べた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  if failures <> '' then
    raise exception 'expert_comment_extras FAILED: %', failures;
  end if;
  raise exception 'expert_comment_extras PASSED（Z1〜Z4。テストデータは取り消されます）';
end $$;
