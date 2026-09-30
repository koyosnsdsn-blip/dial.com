-- dev 環境用の合成データ（架空の相談者・案件・メッセージ）
--
-- 【注意】dev（dial.com-dev）専用。本番には絶対に投入しないこと。
-- 実在の相談内容を複製・加工して使わないこと（未決事項一覧 No.84 の運用ルール）。
-- すべて架空のデータで、メールアドレスは送信不能な .invalid ドメインを使う。
-- 識別しやすいよう、合成データの UUID は 'dddddddd-' で始める。
--
-- 何度実行しても重複しない（on conflict do nothing）。
-- 削除するときは、ファイル末尾の「削除用」を実行する。
--
-- 前提：運営管理者（冨吉）の counselors 行が存在すること。
--   担当者は counselors の中から最初の admin を割り当てる。

do $$
declare
  staff_id uuid := (select counselor_id from counselors where role = 'admin' and status = 'active' order by counselor_id limit 1);
  corp_id  uuid := 'dddddddd-0000-4000-8000-00000000c001';
begin
  if staff_id is null then
    raise exception '運営管理者の counselors 行がありません。先に作成してください';
  end if;

  -- 架空の相談者（ログインはできない：パスワード未設定）
  insert into auth.users (id, email, aud, role, instance_id, email_confirmed_at)
  values
    ('dddddddd-0000-4000-8000-000000000a01', 'sample-user1@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
    ('dddddddd-0000-4000-8000-000000000a02', 'sample-user2@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now()),
    ('dddddddd-0000-4000-8000-000000000a03', 'sample-user3@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now())
  on conflict (id) do nothing;

  -- 架空の契約クライアント（企業契約型）
  insert into clients (client_id, name, contract_type, status, feature_qa, feature_consult, feature_video)
  values (corp_id, '【架空】サンプル株式会社', 'corp', 'active', true, true, true)
  on conflict (client_id) do nothing;

  -- 招待コード（相談者側アプリの動作確認用）。未設定のときだけ、推測困難なランダム文字列を発行する。
  -- 値はファイルに書かない。確認するときは：select invite_code from clients where client_id = 'dddddddd-0000-4000-8000-00000000c001';
  update clients
  set invite_code = translate(encode(gen_random_bytes(12), 'base64'), '+/=', 'xyz')
  where client_id = corp_id and invite_code is null;

  insert into accounts (account_id, email, tier, client_id) values
    ('dddddddd-0000-4000-8000-000000000a01', 'sample-user1@example.invalid', 'paid', null),
    ('dddddddd-0000-4000-8000-000000000a02', 'sample-user2@example.invalid', 'free', null),
    ('dddddddd-0000-4000-8000-000000000a03', 'sample-user3@example.invalid', 'member', corp_id)
  on conflict (account_id) do nothing;

  insert into entitlements (entitlement_id, account_id, source, client_id, rally_max, sla_hours) values
    ('dddddddd-0000-4000-8000-000000000e01', 'dddddddd-0000-4000-8000-000000000a01', 'payment', null, 5, 24),
    ('dddddddd-0000-4000-8000-000000000e02', 'dddddddd-0000-4000-8000-000000000a02', 'payment', null, 5, 24),
    ('dddddddd-0000-4000-8000-000000000e03', 'dddddddd-0000-4000-8000-000000000a03', 'client', corp_id, 1, 24)
  on conflict (entitlement_id) do nothing;

  -- 案件：1件目は運営管理者の担当・緊急なし、2件目は未割当、3件目は企業枠・担当あり
  insert into cases (case_id, entitlement_id, account_id, client_id, counselor_id, status, urgent_flag, rally_used, opened_at, last_activity_at) values
    ('dddddddd-0000-4000-8000-0000000cc001', 'dddddddd-0000-4000-8000-000000000e01', 'dddddddd-0000-4000-8000-000000000a01', null,    staff_id, 'open', false, 1, now() - interval '26 hours', now() - interval '3 hours'),
    ('dddddddd-0000-4000-8000-0000000cc002', 'dddddddd-0000-4000-8000-000000000e02', 'dddddddd-0000-4000-8000-000000000a02', null,    null,     'open', false, 0, now() - interval '5 hours',  now() - interval '5 hours'),
    ('dddddddd-0000-4000-8000-0000000cc003', 'dddddddd-0000-4000-8000-000000000e03', 'dddddddd-0000-4000-8000-000000000a03', corp_id, staff_id, 'open', false, 0, now() - interval '40 minutes', now() - interval '40 minutes')
  on conflict (case_id) do nothing;

  insert into messages (message_id, case_id, sender, body, sent_at) values
    ('dddddddd-0000-4000-8000-00000000f001', 'dddddddd-0000-4000-8000-0000000cc001', 'user',
     '【テストデータ】職場の人間関係で悩んでいます。上司からの指示が毎回変わり、どう動けばよいか分からなくなっています。', now() - interval '26 hours'),
    ('dddddddd-0000-4000-8000-00000000f002', 'dddddddd-0000-4000-8000-0000000cc001', 'counselor',
     '【テストデータ】ご相談ありがとうございます。指示が変わる場面について、もう少し具体的に教えていただけますか。', now() - interval '20 hours'),
    ('dddddddd-0000-4000-8000-00000000f003', 'dddddddd-0000-4000-8000-0000000cc001', 'user',
     '【テストデータ】朝の打ち合わせで決めた内容が、夕方には別の方針になっていることが週に何度かあります。', now() - interval '3 hours'),
    ('dddddddd-0000-4000-8000-00000000f004', 'dddddddd-0000-4000-8000-0000000cc002', 'user',
     '【テストデータ】最近眠れない日が続いていて、仕事に集中できません。誰に相談すればよいか分からず連絡しました。', now() - interval '5 hours'),
    ('dddddddd-0000-4000-8000-00000000f005', 'dddddddd-0000-4000-8000-0000000cc003', 'user',
     '【テストデータ】異動先の部署になじめず、毎朝出社するのがつらいです。', now() - interval '40 minutes')
  on conflict (message_id) do nothing;
end
$$;

-- ============================================================
-- 削除用（合成データだけを消す。必要なときにこの部分だけを実行する）
-- ============================================================
-- delete from messages     where case_id::text like 'dddddddd-%';
-- delete from cases        where case_id::text like 'dddddddd-%';
-- delete from entitlements where entitlement_id::text like 'dddddddd-%';
-- delete from accounts     where account_id::text like 'dddddddd-%';
-- delete from clients      where client_id::text like 'dddddddd-%';
-- delete from auth.users   where id::text like 'dddddddd-%';
