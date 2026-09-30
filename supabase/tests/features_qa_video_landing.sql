-- 機能1（Q&A）の DB 関数と、添付画像の消去・二次利用同意・予約公開のテスト
--   A1 月額会員以外は投稿できない　A2 月3問まで　A3 却下で枠を返す（月2回まで）
--   A4 破棄は枠を返さず、3回で投稿機能を停止する　A5 マージは枠を返す
--   A6 公開：回答が付き、匿名化の修正は差分が残る　A7 対応済みの投稿は再び処理できない
--   A8 書き直しは、区分Eで却下された自分の投稿に1回だけ　A9 通報は1人1回、5件で自動的に一時非公開
--   A10 無料会員の全文閲覧は月3本。一度開いた記事は数えない　A11 似た質問が取れる
--   B1 物理削除で添付ファイルが消去待ちに積まれる　B2 二次利用同意：本人だけが答えられ、同意は記録に残る／期限切れは失効
--   B3 予約公開の動画が時刻を過ぎると公開になる
--   X1 ログイン中のブラウザ（authenticated）は、関数もテーブルも使えない
-- 最終実行：2026-10-01 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  up uuid := '00000000-0000-4000-8000-0000000000d1'; uf uuid := '00000000-0000-4000-8000-0000000000d2'; st uuid := '00000000-0000-4000-8000-0000000000d3';
  g uuid; r jsonb; n int; i int; q uuid; q2 uuid; pub uuid; qs uuid[] := '{}'; failures text := '';
  cl uuid := gen_random_uuid(); e uuid := gen_random_uuid(); c uuid := gen_random_uuid(); m uuid; v uuid := gen_random_uuid();
  rep uuid;
begin
  insert into auth.users (id, email, aud, role, instance_id, encrypted_password) values
    (up, 'qa-p@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x'),
    (uf, 'qa-f@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x'),
    (st, 'qa-s@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x');
  insert into accounts (account_id, email, tier) values (up, 'qa-p@test.invalid', 'paid'), (uf, 'qa-f@test.invalid', 'free');
  insert into counselors (counselor_id, name, role) values (st, 'テスト相談員', 'counselor');
  select genre_id into g from genres order by sort_order limit 1;

  -- A1
  begin
    perform user_post_question(uf, g, '無料会員の投稿');
    failures := failures || 'A1 無料会員が投稿できた; ';
  exception when others then
    if sqlerrm <> 'not_eligible' then failures := failures || format('A1 例外=%s; ', sqlerrm); end if;
  end;

  -- A2
  for i in 1..3 loop
    r := user_post_question(up, g, '子どもが学校に行きたがらないときの接し方を知りたい ' || i);
    qs := qs || (r ->> 'question_id')::uuid;
  end loop;
  if (r ->> 'remaining')::int <> 0 then failures := failures || format('A2 remaining=%s; ', r ->> 'remaining'); end if;
  begin
    perform user_post_question(up, g, '4問目');
    failures := failures || 'A2 4問目を投稿できた; ';
  exception when others then
    if sqlerrm <> 'quota_exceeded' then failures := failures || format('A2 例外=%s; ', sqlerrm); end if;
  end;
  select count(*) into n from questions where account_id = up and display_id like 'Q-%';
  if n <> 3 then failures := failures || format('A2 表示ID=%s; ', n); end if;

  -- A6 公開（匿名化の修正つき）
  r := staff_publish_question(qs[1], st, '一般的には、まず休ませて様子を見ることが多いです。', '子どもが学校に行きたがらないときの接し方を知りたい');
  if not (r ->> 'anonymized')::boolean then failures := failures || 'A6 匿名化の記録なし; '; end if;
  select count(*) into n from anonymization_edits where question_id = qs[1];
  if n <> 1 then failures := failures || format('A6 差分=%s; ', n); end if;
  select count(*) into n from questions q0 where q0.question_id = qs[1] and qa_is_public(q0) and exists (select 1 from answers a where a.question_id = q0.question_id);
  if n <> 1 then failures := failures || 'A6 公開されていない; '; end if;
  pub := qs[1];
  -- A7
  begin
    perform staff_reject_question(pub, st, 'B', null);
    failures := failures || 'A7 公開済みを却下できた; ';
  exception when others then
    if sqlerrm <> 'not_pending' then failures := failures || format('A7 例外=%s; ', sqlerrm); end if;
  end;

  -- A3 却下（E）→ 枠が戻る → 書き直し（A8）
  r := staff_reject_question(qs[2], st, 'E', '状況をもう少し詳しく');
  if not (r ->> 'quota_returned')::boolean then failures := failures || 'A3 枠が戻らない; '; end if;
  begin
    perform user_post_question(up, g, '他人の投稿の書き直し', pub);
    failures := failures || 'A8 却下されていない投稿を書き直せた; ';
  exception when others then
    if sqlerrm <> 'invalid_resubmit' then failures := failures || format('A8 例外=%s; ', sqlerrm); end if;
  end;
  r := user_post_question(up, g, '書き直した質問です。小学3年生の子どもについて', qs[2]);
  q := (r ->> 'question_id')::uuid;
  begin
    perform user_post_question(up, g, '同じ投稿の2回目の書き直し', qs[2]);
    failures := failures || 'A8 同じ投稿を2回書き直せた; ';
  exception when others then
    if sqlerrm not in ('invalid_resubmit', 'quota_exceeded') then failures := failures || format('A8 例外=%s; ', sqlerrm); end if;
  end;

  -- A5 マージ → 枠が戻る（used が減る）
  r := staff_merge_question(qs[3], st, pub);
  select used - returned into n from post_quotas where account_id = up;
  if n <> 2 then failures := failures || format('A5 マージ後の使用数=%s; ', n); end if;
  begin
    perform staff_merge_question(q, st, qs[3]);
    failures := failures || 'A5 公開されていない記事へマージできた; ';
  exception when others then
    if sqlerrm <> 'invalid_merge_target' then failures := failures || format('A5 例外=%s; ', sqlerrm); end if;
  end;

  -- A3 返却は月2回まで：2回目は戻る、3回目は戻らない
  r := staff_reject_question(q, st, 'B', null);
  if not (r ->> 'quota_returned')::boolean then failures := failures || 'A3 2回目の返却がない; '; end if;
  r := user_post_question(up, g, '別の質問 A');
  r := staff_reject_question((r ->> 'question_id')::uuid, st, 'F', null);
  if (r ->> 'quota_returned')::boolean then failures := failures || 'A3 3回目も返却された; '; end if;

  -- A4 破棄：枠は戻らない。3回で停止。枠を使い切らないよう、使用数を直接戻してから試す
  update post_quotas set used = 0, returned = 0 where account_id = up;
  for i in 1..3 loop
    r := user_post_question(up, g, 'あああああ ' || i);
    r := staff_discard_question((r ->> 'question_id')::uuid, st, 'G1', '意味をなさない文字列');
  end loop;
  if not (r ->> 'suspended')::boolean then failures := failures || 'A4 3回の破棄で停止しない; '; end if;
  select used - returned into n from post_quotas where account_id = up;
  if n <> 3 then failures := failures || format('A4 破棄で枠が戻った(%s); ', n); end if;
  begin
    perform user_post_question(up, g, '停止後の投稿');
    failures := failures || 'A4 停止後に投稿できた; ';
  exception when others then
    if sqlerrm <> 'posting_suspended' then failures := failures || format('A4 例外=%s; ', sqlerrm); end if;
  end;

  -- A11 似た質問
  select count(*) into n from qa_similar('子どもが学校に行きたがらない');
  if n < 1 then failures := failures || 'A11 似た質問が取れない; '; end if;

  -- A10 無料会員の全文閲覧：運営作成の記事を4本用意
  for i in 1..4 loop
    insert into questions (genre_id, body, status, operator_created, published_at) values (g, '運営の記事 ' || i, 'published', true, now()) returning question_id into q2;
    qs := qs || q2;
  end loop;
  r := user_unlock_answer(uf, qs[4]); r := user_unlock_answer(uf, qs[5]); r := user_unlock_answer(uf, qs[6]);
  if (r ->> 'remaining')::int <> 0 then failures := failures || format('A10 remaining=%s; ', r ->> 'remaining'); end if;
  r := user_unlock_answer(uf, qs[4]);  -- 開いたことのある記事は数えない
  begin
    perform user_unlock_answer(uf, qs[7]);
    failures := failures || 'A10 4本目を開けた; ';
  exception when others then
    if sqlerrm <> 'read_quota_exceeded' then failures := failures || format('A10 例外=%s; ', sqlerrm); end if;
  end;

  -- A9 通報
  r := user_report_question(uf, pub, 'identifiable');
  begin
    perform user_report_question(uf, pub, 'other');
    failures := failures || 'A9 同じ人が2回通報できた; ';
  exception when others then
    if sqlerrm <> 'already_reported' then failures := failures || format('A9 例外=%s; ', sqlerrm); end if;
  end;
  for i in 1..4 loop
    rep := gen_random_uuid();
    insert into auth.users (id, email, aud, role, instance_id, encrypted_password) values (rep, 'qa-r' || i || '@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x');
    insert into accounts (account_id, email, tier) values (rep, 'qa-r' || i || '@test.invalid', 'free');
    r := user_report_question(rep, pub, 'inappropriate');
  end loop;
  if not (r ->> 'auto_hidden')::boolean then failures := failures || 'A9 5件で一時非公開にならない; '; end if;
  select count(*) into n from questions q0 where q0.question_id = pub and qa_is_public(q0);
  if n <> 0 then failures := failures || 'A9 公開のまま; '; end if;

  -- B1 物理削除で添付ファイルが消去待ちに積まれる
  insert into clients (client_id, name, contract_type, status, feature_consult) values (cl, 'テスト', 'corp', 'active', true);
  insert into entitlements (entitlement_id, account_id, source, client_id, rally_max, sla_hours) values (e, uf, 'client', cl, 1, 24);
  insert into cases (case_id, entitlement_id, account_id, client_id, status, close_reason, closed_at) values (c, e, uf, cl, 'closed', 'manual', now());
  insert into messages (case_id, sender, body) values (c, 'user', 'x') returning message_id into m;
  insert into attachments (message_id, file_ref, mime_type) values (m, 'cases/' || c || '/a.jpg', 'image/jpeg');

  -- B2 二次利用同意
  insert into reuse_consents (case_id, status, requested_at, expires_at) values (c, 'requested', now(), now() + interval '30 days');
  begin
    perform user_answer_reuse(up, c, true);
    failures := failures || 'B2 他人が答えられた; ';
  exception when others then
    if sqlerrm <> 'not_found' then failures := failures || format('B2 例外=%s; ', sqlerrm); end if;
  end;
  r := user_answer_reuse(uf, c, true);
  select count(*) into n from consents where account_id = uf and doc_type = 'reuse';
  if r ->> 'status' <> 'agreed' or n <> 1 then failures := failures || format('B2 status=%s 記録=%s; ', r ->> 'status', n); end if;
  update reuse_consents set status = 'requested', expires_at = now() - interval '1 minute' where case_id = c;
  if system_expire_reuse_requests() < 1 then failures := failures || 'B2 期限切れが失効しない; '; end if;

  perform user_delete_case(uf, c);
  update deletion_requests set purge_after = now() - interval '1 minute' where target_id = c;
  r := system_purge_deleted();
  select count(*) into n from storage_purge_queue where file_ref = 'cases/' || c || '/a.jpg' and done_at is null;
  if n <> 1 then failures := failures || format('B1 消去待ち=%s; ', n); end if;
  select count(*) into n from attachments where message_id = m;
  if n <> 0 then failures := failures || 'B1 添付の行が残った; '; end if;

  -- B3 予約公開
  insert into videos (video_id, title, scope_personal, scope_business, status, published_at) values (v, 'テスト動画', 'free', 'none', 'scheduled', now() - interval '1 minute');
  perform system_publish_scheduled_videos();
  select count(*) into n from videos where video_id = v and status = 'published';
  if n <> 1 then failures := failures || 'B3 予約公開されない; '; end if;
  select count(*) into n from cron.job where jobname in ('expire-reuse-requests', 'publish-scheduled-videos');
  if n <> 2 then failures := failures || format('B3 定期実行=%s; ', n); end if;

  -- X1
  perform set_config('request.jwt.claims', json_build_object('sub', up, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin
    perform user_post_question(up, g, 'x');
    failures := failures || 'X1 関数を呼べた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from questions;
    failures := failures || 'X1 questions を読めた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from videos;
    failures := failures || 'X1 videos を読めた; ';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from storage.objects where bucket_id = 'case-attachments';
    if n <> 0 then failures := failures || 'X1 添付のバケットが見えた; '; end if;
  exception when insufficient_privilege then null;
  end;
  reset role;

  if failures <> '' then
    raise exception 'features_qa_video_landing FAILED: %', failures;
  end if;
  raise exception 'features_qa_video_landing PASSED（テストデータは取り消されます）';
end $$;
