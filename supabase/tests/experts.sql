-- 先生コメントの土台のテスト（2026-10-09。docs/未決事項一覧 2.19）
--
-- 確認すること：
--   X1 先生（MFA済）は、相談内容系（cases・messages・case_summaries・emergency_records・case_survey_answers）と
--      questions・answers を読めない。先生は相談員（counselors）として扱われない
--   X2 先生が見られる質問は、公開済み・削除されていない・担当ジャンルの質問だけ（expert_visible_questions）
--   X3 先生が MFA 未通過（aal1）だと、質問もコメントも見えない
--   X4 先生はブラウザから expert_comments を直接書き込めない
--   X5 コメントを作れるのは、担当ジャンルの公開済み質問だけ（別ジャンル・未公開・削除済みは作れない）
--   X6 状態の移り方：下書き→確認待ち→公開、差し戻し→本文の修正→再提出、公開↔非表示。飛ばせない。
--      確認待ち以降は本文を変えられない。公開・差し戻しには確認した相談員が必要。時刻はトリガが記録する
--   X7 他の先生のコメントは読めない。相談員は MFA 済みなら全件読め、MFA 未通過なら読めない
--   X8 質問が削除されると、先生コメントも消える
--   X9 先生のIDは、相談員・利用者と重ならない
--   X10 監査ログの操作者に「先生」を記録できる
-- 最後に必ず例外を投げて取り消すため、テストデータは残らない。
--   成功時のメッセージ： "experts PASSED ..."
do $$
declare
  u_ex1   uuid := '00000000-0000-4000-8000-0000000000e1';  -- 先生1（ジャンルg1担当）
  u_ex2   uuid := '00000000-0000-4000-8000-0000000000e2';  -- 先生2（ジャンルg2担当）
  u_cnsl  uuid := '00000000-0000-4000-8000-0000000000e3';  -- 相談員
  u_acc   uuid := '00000000-0000-4000-8000-0000000000e4';  -- 利用者（質問の投稿者・案件あり）
  g1      uuid := gen_random_uuid();
  g2      uuid := gen_random_uuid();
  q_ok    uuid := gen_random_uuid();  -- 公開済み・g1
  q_other uuid := gen_random_uuid();  -- 公開済み・g2
  q_pend  uuid := gen_random_uuid();  -- 未公開・g1
  q_hid   uuid := gen_random_uuid();  -- 削除済み・g1
  ent     uuid := gen_random_uuid();
  cs      uuid := gen_random_uuid();
  cm      uuid;
  n       int;
  s       text;
  failures text := '';
begin
  -- ---------- テストデータ ----------
  insert into auth.users (id, email, aud, role, instance_id) values
    (u_ex1,  'ex1@test.invalid',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_ex2,  'ex2@test.invalid',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_cnsl, 'cnsl@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (u_acc,  'acc@test.invalid',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into counselors (counselor_id, name, role) values (u_cnsl, 'テスト相談員', 'counselor');
  insert into accounts (account_id, email) values (u_acc, 'acc@test.invalid');

  insert into genres (genre_id, name) values (g1, 'テストジャンル1'), (g2, 'テストジャンル2');
  insert into experts (expert_id, display_name, qualification) values
    (u_ex1, 'テスト先生1', '臨床心理士'),
    (u_ex2, 'テスト先生2', '弁護士');
  insert into expert_genres (expert_id, genre_id) values (u_ex1, g1), (u_ex2, g2);

  insert into questions (question_id, account_id, display_id, genre_id, body, status, published_at) values
    (q_ok,    u_acc, 'xt-ok',    g1, '公開済みの質問', 'published', now()),
    (q_other, u_acc, 'xt-other', g2, '別ジャンルの質問', 'published', now()),
    (q_pend,  u_acc, 'xt-pend',  g1, '未公開の質問', 'pending', null);
  insert into questions (question_id, account_id, display_id, genre_id, body, status, published_at, hidden_at)
  values (q_hid, u_acc, 'xt-hid', g1, '削除済みの質問', 'published', now(), now());

  insert into entitlements (entitlement_id, account_id, source, rally_max, sla_hours) values (ent, u_acc, 'payment', 5, 24);
  insert into cases (case_id, entitlement_id, account_id, counselor_id, status, opened_at)
  values (cs, ent, u_acc, u_cnsl, 'open', now());
  insert into messages (case_id, sender, body) values (cs, 'user', '相談のメッセージ');
  insert into case_summaries (case_id, content) values (cs, 'サマリ');
  insert into emergency_records (case_id, detection) values (cs, 'テスト');

  -- ---------- X1：先生は相談内容系を読めない ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_ex1, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  if is_active_counselor() or is_active_admin_counselor() then failures := failures || 'X1 先生が相談員として扱われた; '; end if;
  select count(*) into n from cases;              if n <> 0 then failures := failures || 'X1 cases が読めた; '; end if;
  select count(*) into n from messages;           if n <> 0 then failures := failures || 'X1 messages が読めた; '; end if;
  select count(*) into n from case_summaries;     if n <> 0 then failures := failures || 'X1 case_summaries が読めた; '; end if;
  select count(*) into n from emergency_records;  if n <> 0 then failures := failures || 'X1 emergency_records が読めた; '; end if;
  select count(*) into n from case_survey_answers; if n <> 0 then failures := failures || 'X1 case_survey_answers が読めた; '; end if;
  begin
    select count(*) into n from questions;
    if n <> 0 then failures := failures || 'X1 questions が読めた; '; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from answers;
    if n <> 0 then failures := failures || 'X1 answers が読めた; '; end if;
  exception when insufficient_privilege then null;
  end;

  -- ---------- X2：見られる質問は公開済み・担当ジャンルだけ ----------
  select count(*) into n from expert_visible_questions();
  if n <> 1 then failures := failures || format('X2 見える質問が %s 件（期待は1件）; ', n); end if;
  select count(*) into n from expert_visible_questions() where question_id = q_ok;
  if n <> 1 then failures := failures || 'X2 担当ジャンルの公開済み質問が見えない; '; end if;

  -- ---------- X4：先生は直接書き込めない ----------
  begin
    insert into expert_comments (question_id, expert_id, body) values (q_ok, u_ex1, '直接書いた');
    failures := failures || 'X4 ブラウザから書けた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- ---------- X3：MFA未通過（aal1）だと何も見えない ----------
  insert into expert_comments (question_id, expert_id, body) values (q_ok, u_ex1, 'aal1で見えないはずのコメント');
  perform set_config('request.jwt.claims', json_build_object('sub', u_ex1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from expert_visible_questions();
  if n <> 0 then failures := failures || 'X3 aal1 で質問が見えた; '; end if;
  select count(*) into n from expert_comments;
  if n <> 0 then failures := failures || 'X3 aal1 でコメントが見えた; '; end if;
  reset role;
  delete from expert_comments where question_id = q_ok;

  -- ---------- X5：コメントを作れる条件 ----------
  begin
    insert into expert_comments (question_id, expert_id, body) values (q_other, u_ex1, '別ジャンル');
    failures := failures || 'X5 担当外のジャンルに作れた; ';
  exception when raise_exception then null;
  end;
  begin
    insert into expert_comments (question_id, expert_id, body) values (q_pend, u_ex1, '未公開');
    failures := failures || 'X5 未公開の質問に作れた; ';
  exception when raise_exception then null;
  end;
  begin
    insert into expert_comments (question_id, expert_id, body) values (q_hid, u_ex1, '削除済み');
    failures := failures || 'X5 削除済みの質問に作れた; ';
  exception when raise_exception then null;
  end;
  begin
    insert into expert_comments (question_id, expert_id, body, status) values (q_ok, u_ex1, '最初から公開', 'published');
    failures := failures || 'X5 最初から公開で作れた; ';
  exception when raise_exception then null;
  end;
  update experts set status = 'suspended' where expert_id = u_ex1;
  begin
    insert into expert_comments (question_id, expert_id, body) values (q_ok, u_ex1, '退任後');
    failures := failures || 'X5 退任した先生が作れた; ';
  exception when raise_exception then null;
  end;
  update experts set status = 'active' where expert_id = u_ex1;

  insert into expert_comments (question_id, expert_id, body) values (q_ok, u_ex1, '最初の下書き') returning comment_id into cm;

  -- ---------- X6：状態の移り方 ----------
  begin
    update expert_comments set status = 'published', reviewed_by = u_cnsl where comment_id = cm;
    failures := failures || 'X6 下書きから公開へ飛べた; ';
  exception when raise_exception then null;
  end;
  update expert_comments set body = '下書きを直した' where comment_id = cm;
  update expert_comments set status = 'pending' where comment_id = cm;
  select (submitted_at is not null)::text into s from expert_comments where comment_id = cm;
  if s <> 'true' then failures := failures || 'X6 提出時刻が記録されない; '; end if;
  begin
    update expert_comments set body = '確認待ちの間に変えた' where comment_id = cm;
    failures := failures || 'X6 確認待ちの本文を変えられた; ';
  exception when raise_exception then null;
  end;
  -- 差し戻し→修正→再提出（理由は再提出で消える）
  begin
    update expert_comments set status = 'returned' where comment_id = cm;
    failures := failures || 'X6 相談員なしで差し戻せた; ';
  exception when raise_exception then null;
  end;
  update expert_comments set status = 'returned', reviewed_by = u_cnsl, review_note = '断定的な表現を直してください' where comment_id = cm;
  update expert_comments set body = '直した本文' where comment_id = cm;
  update expert_comments set status = 'pending' where comment_id = cm;
  select coalesce(review_note, '（なし）') into s from expert_comments where comment_id = cm;
  if s <> '（なし）' then failures := failures || 'X6 再提出で差し戻しの理由が消えない; '; end if;
  -- 公開
  begin
    update expert_comments set status = 'published' where comment_id = cm;
    failures := failures || 'X6 相談員なしで公開できた; ';
  exception when raise_exception then null;
  end;
  update expert_comments set status = 'published', reviewed_by = u_cnsl where comment_id = cm;
  select (published_at is not null)::text into s from expert_comments where comment_id = cm;
  if s <> 'true' then failures := failures || 'X6 公開時刻が記録されない; '; end if;
  begin
    update expert_comments set body = '公開後に変えた' where comment_id = cm;
    failures := failures || 'X6 公開後に本文を変えられた; ';
  exception when raise_exception then null;
  end;
  begin
    update expert_comments set status = 'draft' where comment_id = cm;
    failures := failures || 'X6 公開から下書きへ戻れた; ';
  exception when raise_exception then null;
  end;
  update expert_comments set status = 'hidden' where comment_id = cm;
  select (hidden_at is not null)::text into s from expert_comments where comment_id = cm;
  if s <> 'true' then failures := failures || 'X6 非表示の時刻が記録されない; '; end if;
  update expert_comments set status = 'published', reviewed_by = u_cnsl where comment_id = cm;
  select (hidden_at is null)::text into s from expert_comments where comment_id = cm;
  if s <> 'true' then failures := failures || 'X6 再公開で非表示の時刻が消えない; '; end if;

  -- ---------- X7：読める範囲 ----------
  perform set_config('request.jwt.claims', json_build_object('sub', u_ex2, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from expert_comments;
  if n <> 0 then failures := failures || 'X7 他の先生のコメントが読めた; '; end if;
  select count(*) into n from experts where expert_id <> u_ex2;
  if n <> 0 then failures := failures || 'X7 他の先生の情報が読めた; '; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_ex1, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from expert_comments;
  if n <> 1 then failures := failures || 'X7 自分のコメントが読めない; '; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_cnsl, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from expert_comments;
  if n <> 1 then failures := failures || 'X7 相談員（MFA済）がコメントを読めない; '; end if;
  select count(*) into n from experts;
  if n <> 2 then failures := failures || 'X7 相談員（MFA済）が先生を読めない; '; end if;
  select count(*) into n from expert_visible_questions();
  if n <> 0 then failures := failures || 'X7 相談員が先生用の質問一覧を読めた; '; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_cnsl, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from expert_comments;
  if n <> 0 then failures := failures || 'X7 相談員（MFA未通過）がコメントを読めた; '; end if;
  select count(*) into n from experts;
  if n <> 0 then failures := failures || 'X7 相談員（MFA未通過）が先生を読めた; '; end if;
  reset role;

  -- ---------- X9：IDの重複 ----------
  begin
    insert into experts (expert_id, display_name, qualification) values (u_cnsl, '相談員と同じID', '臨床心理士');
    failures := failures || 'X9 相談員と同じIDで先生を作れた; ';
  exception when raise_exception then null;
  end;
  begin
    insert into experts (expert_id, display_name, qualification) values (u_acc, '利用者と同じID', '臨床心理士');
    failures := failures || 'X9 利用者と同じIDで先生を作れた; ';
  exception when raise_exception then null;
  end;

  -- ---------- X10：監査ログ ----------
  begin
    insert into audit_logs (actor_type, actor_id, action, target_type, target_id)
    values ('expert', u_ex1, 'expert_comment.submit', 'expert_comments', cm);
  exception when check_violation then
    failures := failures || 'X10 監査ログに先生を記録できない; ';
  end;

  -- ---------- X8：質問が削除されるとコメントも消える ----------
  update questions set hidden_at = now() where question_id = q_ok;
  select count(*) into n from expert_comments where question_id = q_ok;
  if n <> 0 then failures := failures || 'X8 質問の削除後もコメントが残った; '; end if;

  if failures <> '' then
    raise exception 'experts FAILED: %', failures;
  end if;
  raise exception 'experts PASSED（X1〜X10。テストデータは取り消されます）';
end $$;
