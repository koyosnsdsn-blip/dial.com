-- 退会時の機能1のデータの片づけと、四半期レポートの動画視聴数のテスト
--   F1 退会すると、公開済みの投稿は本人との紐付けだけが消え、記事は公開のまま残る
--   F2 公開されていない投稿は、本文が消えて非表示になる
--   F3 全文閲覧の記録・通知の設定が消え、通報は通報者の紐付けだけが消える
--   F4 四半期レポートに、クライアント全体の動画の視聴数が入る（小規模クライアントにも出す）
-- 最終実行：2026-10-01 dev で合格。最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  u uuid := '00000000-0000-4000-8000-0000000000e1'; m uuid := '00000000-0000-4000-8000-0000000000e2';
  g uuid; q1 uuid; q2 uuid; q3 uuid; v uuid := gen_random_uuid(); cl uuid := gen_random_uuid();
  qs date := (date_trunc('quarter', (now() at time zone 'Asia/Tokyo')::date) - interval '3 months')::date;
  n int; failures text := '';
begin
  insert into auth.users (id, email, aud, role, instance_id, encrypted_password) values
    (u, 'fu-u@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x'),
    (m, 'fu-m@test.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', 'x');
  insert into clients (client_id, name, contract_type, status, feature_consult, employee_count) values (cl, 'テスト小規模', 'corp', 'active', true, 10);
  insert into accounts (account_id, email, tier, client_id) values (u, 'fu-u@test.invalid', 'paid', null), (m, 'fu-m@test.invalid', 'member', cl);
  select genre_id into g from genres order by sort_order limit 1;
  insert into questions (account_id, display_id, genre_id, body, status, published_at) values (u, 'Q-TESTFU0001', g, '公開済みの投稿', 'published', now()) returning question_id into q1;
  insert into questions (account_id, display_id, genre_id, body, status) values (u, 'Q-TESTFU0002', g, '確認中の投稿', 'pending') returning question_id into q2;
  insert into questions (genre_id, body, status, operator_created, published_at) values (g, '運営の記事', 'published', true, now()) returning question_id into q3;
  insert into qa_full_reads (account_id, question_id, year_month) values (u, q3, '2026-10');
  insert into notification_settings (account_id, kind, enabled) values (u, 'reply', false);
  insert into reports (question_id, reporter_account_id, reason_code) values (q3, u, 'other');

  perform user_withdraw(u);
  select count(*) into n from questions q where q.question_id = q1 and q.account_id is null and qa_is_public(q) and q.body = '公開済みの投稿';
  if n <> 1 then failures := failures || 'F1 公開済みの投稿の扱いが違う; '; end if;
  select count(*) into n from questions where question_id = q2 and account_id is null and hidden_at is not null and body = '（削除済み）';
  if n <> 1 then failures := failures || 'F2 公開されていない投稿が残った; '; end if;
  select (select count(*) from qa_full_reads where account_id = u) + (select count(*) from notification_settings where account_id = u) into n;
  if n <> 0 then failures := failures || format('F3 残り=%s; ', n); end if;
  select count(*) into n from reports where question_id = q3 and reporter_account_id is null;
  if n <> 1 then failures := failures || 'F3 通報の紐付けが残った; '; end if;

  insert into videos (video_id, title, scope_personal, scope_business, status, published_at) values (v, 'テスト', 'none', 'all', 'published', now());
  insert into video_views (video_id, account_id, viewed_at) values
    (v, m, ((qs + 10)::text || ' 12:00:00+09')::timestamptz), (v, m, ((qs + 20)::text || ' 12:00:00+09')::timestamptz), (v, m, now());
  perform system_generate_quarterly_reports(qs, cl);
  select count(*) into n from client_quarterly_reports where client_id = cl and quarter_start = qs and video_views = 2 and cases_total is null and members = 1;
  if n <> 1 then failures := failures || 'F4 動画の視聴数が違う; '; end if;

  if failures <> '' then
    raise exception 'reports_and_withdraw_followup FAILED: %', failures;
  end if;
  raise exception 'reports_and_withdraw_followup PASSED（テストデータは取り消されます）';
end $$;
