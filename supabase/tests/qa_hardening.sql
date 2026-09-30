-- 機能1（Q&A）の補強のテスト
--   H1 利用者が削除した投稿（hidden_at あり）は、公開・却下・破棄・マージのどれもできない
--   H2 削除済みの投稿は、破棄の回数に数えられない（投稿機能の停止につながらない）
--   H3 投稿が削除されると、匿名化のための修正の履歴（修正前の本文）も消える
--   H4 削除されていない投稿は、これまでどおり処理できる
-- 最終実行：2026-10-01 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u uuid := '00000000-0000-4000-8000-0000000000f1'; st uuid := '00000000-0000-4000-8000-0000000000f2';
  g uuid; q uuid; p uuid; n int; failures text := ''; fn text;
begin
  insert into auth.users (id, email, aud, role, instance_id, encrypted_password) values
    (u, 'hd-u@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x'),
    (st, 'hd-s@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x');
  insert into accounts (account_id, email, tier) values (u, 'hd-u@test.invalid', 'paid');
  insert into counselors (counselor_id, name, role) values (st, 'テスト相談員', 'counselor');
  select genre_id into g from genres order by sort_order limit 1;
  insert into questions (genre_id, body, status, operator_created, published_at) values (g, '公開中の記事', 'published', true, now()) returning question_id into p;
  q := (user_post_question(u, g, '削除する予定の投稿') ->> 'question_id')::uuid;
  -- 利用者による削除と同じ更新
  update questions set body = '（削除済み）', hidden_at = now() where question_id = q;

  foreach fn in array array['publish', 'reject', 'discard', 'merge'] loop
    begin
      if fn = 'publish' then perform staff_publish_question(q, st, '回答', '書き戻される本文');
      elsif fn = 'reject' then perform staff_reject_question(q, st, 'B', null);
      elsif fn = 'discard' then perform staff_discard_question(q, st, 'G1', '理由');
      else perform staff_merge_question(q, st, p);
      end if;
      failures := failures || format('H1 削除済みの投稿を %s できた; ', fn);
    exception when others then
      if sqlerrm <> 'not_found' then failures := failures || format('H1 %s 例外=%s; ', fn, sqlerrm); end if;
    end;
  end loop;
  select count(*) into n from questions where question_id = q and status = 'pending' and body = '（削除済み）';
  if n <> 1 then failures := failures || 'H1 削除済みの投稿が書き換わった; '; end if;
  select (select count(*) from answers where question_id = q) + (select count(*) from anonymization_edits where question_id = q) + (select count(*) from question_actions where question_id = q) into n;
  if n <> 0 then failures := failures || format('H1 処理の記録が残った(%s); ', n); end if;
  select count(*) into n from questions where account_id = u and status = 'discarded';
  if n <> 0 then failures := failures || 'H2 破棄に数えられた; '; end if;

  -- H3・H4：別の投稿を、修正つきで公開 → 運営による削除と同じ更新
  q := (user_post_question(u, g, '東京都の〇〇小学校に通う子どもについて') ->> 'question_id')::uuid;
  perform staff_publish_question(q, st, '回答', '小学校に通う子どもについて');
  select count(*) into n from anonymization_edits where question_id = q;
  if n <> 1 then failures := failures || 'H4 公開できない・修正の履歴がない; '; end if;
  update questions set body = '（削除済み）', hidden_at = now(), unpublished_at = now() where question_id = q;
  select count(*) into n from anonymization_edits where question_id = q;
  if n <> 0 then failures := failures || 'H3 修正前の本文が残った; '; end if;

  if failures <> '' then
    raise exception 'qa_hardening FAILED: %', failures;
  end if;
  raise exception 'qa_hardening PASSED（テストデータは取り消されます）';
end $$;
