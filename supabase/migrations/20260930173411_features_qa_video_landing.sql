-- 機能1（Q&A）・機能3（動画）・ランディングページ・添付画像・運営機能の残り
--
-- 方針（これまでと同じ）：
--   - ここで扱うテーブルは、ブラウザ（authenticated / anon）に権限を与えない。RLS は有効のまま、ポリシーを作らない
--   - 読み書きはすべて Nuxt のサーバールートから service role で行う。サーバールートが本人確認と範囲の確認をする
--   - 複数の行をまとめて変える操作（投稿枠の増減、公開、却下など）は DB 関数にまとめ、service_role だけが実行できる
--
-- 【仮】と書いた値は未決事項。system_settings で変更できる

create extension if not exists pg_trgm with schema extensions;

-- ============================================================
-- 1) 機能1：Q&A
-- ============================================================

-- 運営が作成した記事・投稿者が紐付けを削除した記事は、投稿者を持たない（要件 7.11.1・9.3）
alter table questions alter column account_id drop not null;
alter table questions
  add column unpublished_at   timestamptz,           -- 非公開化（運営の判断・通報の集中による一時非公開）
  add column unpublish_reason text,
  add column featured         boolean not null default false,  -- 注目記事（7.11.2）
  add column view_count       int not null default 0,
  add column resubmitted_from uuid references questions(question_id),  -- 却下（区分E）からの再投稿（6.4.3）
  add column source_case_id   uuid references cases(case_id);  -- 相談内容を素材にした記事（二次利用同意が前提：9.4）

create index idx_questions_public on questions (published_at desc) where status = 'published';
create index idx_questions_account on questions (account_id);
create index idx_questions_body_trgm on questions using gin (body extensions.gin_trgm_ops);

alter table reports
  add column resolved_by     uuid,
  add column resolution_note text;
-- 同じ利用者は、同じ記事を対応が済むまで1回だけ通報できる
create unique index uq_reports_open_per_account on reports (question_id, reporter_account_id) where resolution is null;

-- 無料会員が回答の全文を読んだ記録（月3本まで：要件 2.4）
create table qa_full_reads (
  account_id   uuid not null references accounts(account_id),
  question_id  uuid not null references questions(question_id),
  year_month   text not null,
  read_at      timestamptz not null default now(),
  primary key (account_id, question_id)
);
alter table qa_full_reads enable row level security;

-- 【仮】ジャンルの初期値（要件 2.3 の例）
insert into genres (name, sort_order) values ('子育て', 1), ('発達・就学', 2), ('健康', 3), ('職場の人間関係・ハラスメント', 4);

-- 公開中かどうか
create or replace function qa_is_public(q questions)
returns boolean language sql immutable
as $$ select q.status = 'published' and q.unpublished_at is null and q.hidden_at is null $$;

-- 投稿（月額会員のみ・月3問まで：要件 2.5）
create or replace function user_post_question(p_account_id uuid, p_genre_id uuid, p_body text, p_resubmitted_from uuid default null)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_acc accounts%rowtype;
  v_ym text := to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM');
  v_quota post_quotas%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_depth int := 0;
  v_cur uuid := p_resubmitted_from;
  v_orig questions%rowtype;
  v_id uuid;
begin
  select * into v_acc from accounts where account_id = p_account_id and deleted_at is null for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_acc.tier <> 'paid' then raise exception 'not_eligible' using errcode = '22023'; end if;
  if v_acc.posting_suspended then raise exception 'posting_suspended' using errcode = '22023'; end if;
  if v_body = '' then raise exception 'empty_body' using errcode = '22023'; end if;
  if char_length(v_body) > 2000 then raise exception 'body_too_long' using errcode = '22023'; end if;
  if p_genre_id is null or not exists (select 1 from genres where genre_id = p_genre_id) then
    raise exception 'invalid_genre' using errcode = '22023';
  end if;

  if p_resubmitted_from is not null then
    select * into v_orig from questions where question_id = p_resubmitted_from;
    if not found or v_orig.account_id is distinct from p_account_id or v_orig.status <> 'rejected'
       or not exists (select 1 from question_actions a where a.question_id = v_orig.question_id and a.action = 'reject' and a.reason_code = 'E') then
      raise exception 'invalid_resubmit' using errcode = '22023';
    end if;
    if exists (select 1 from questions where resubmitted_from = p_resubmitted_from) then
      raise exception 'invalid_resubmit' using errcode = '22023';
    end if;
    -- 同じ投稿からの書き直しは【仮】2回まで（未決事項 No.31）
    while v_cur is not null loop
      v_depth := v_depth + 1;
      select resubmitted_from into v_cur from questions where question_id = v_cur;
    end loop;
    if v_depth > setting_int('qa_resubmit_max', 2) then
      raise exception 'resubmit_limit' using errcode = '22023';
    end if;
  end if;

  insert into post_quotas (account_id, year_month) values (p_account_id, v_ym) on conflict do nothing;
  select * into v_quota from post_quotas where account_id = p_account_id and year_month = v_ym for update;
  if v_quota.used - v_quota.returned >= 3 then
    raise exception 'quota_exceeded' using errcode = '22023';
  end if;

  insert into questions (account_id, display_id, genre_id, body, resubmitted_from)
  values (p_account_id, 'Q-' || upper(encode(gen_random_bytes(5), 'hex')), p_genre_id, v_body, p_resubmitted_from)
  returning question_id into v_id;
  update post_quotas set used = used + 1 where account_id = p_account_id and year_month = v_ym;

  return jsonb_build_object('question_id', v_id, 'remaining', 3 - (v_quota.used + 1 - v_quota.returned));
end;
$$;

-- 回答して公開する。p_body を渡すと、匿名化のための修正として差分を残す（要件 6.4.2）
create or replace function staff_publish_question(p_question_id uuid, p_counselor_id uuid, p_answer text, p_body text default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_q questions%rowtype;
  v_answer text := btrim(coalesce(p_answer, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_edited boolean := false;
begin
  select * into v_q from questions where question_id = p_question_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_q.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  if v_answer = '' then raise exception 'empty_body' using errcode = '22023'; end if;
  if char_length(v_answer) > 5000 or char_length(v_body) > 2000 then raise exception 'body_too_long' using errcode = '22023'; end if;

  if v_body <> '' and v_body <> v_q.body then
    insert into anonymization_edits (question_id, before_text, after_text, counselor_id) values (p_question_id, v_q.body, v_body, p_counselor_id);
    insert into question_actions (question_id, action, counselor_id) values (p_question_id, 'anonymize', p_counselor_id);
    update questions set body = v_body where question_id = p_question_id;
    v_edited := true;
  end if;

  insert into answers (question_id, counselor_id, body, published_at) values (p_question_id, p_counselor_id, v_answer, now());
  update questions set status = 'published', published_at = now() where question_id = p_question_id;
  insert into question_actions (question_id, action, counselor_id) values (p_question_id, 'publish', p_counselor_id);
  return jsonb_build_object('published', true, 'anonymized', v_edited);
end;
$$;

-- 却下（区分 B / E / F）。投稿枠を返す（月2回まで：要件 6.4.6）
create or replace function staff_reject_question(p_question_id uuid, p_counselor_id uuid, p_code text, p_text text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_q questions%rowtype;
  v_ym text;
  v_returned boolean := false;
  v_max int := least(setting_int('qa_return_max', 2), 2);
begin
  if p_code not in ('B', 'E', 'F') then raise exception 'invalid_code' using errcode = '22023'; end if;
  select * into v_q from questions where question_id = p_question_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_q.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;

  if v_q.account_id is not null then
    v_ym := to_char(v_q.posted_at at time zone 'Asia/Tokyo', 'YYYY-MM');
    update post_quotas set returned = returned + 1
    where account_id = v_q.account_id and year_month = v_ym and returned < v_max and returned < used;
    v_returned := found;
  end if;

  update questions set status = 'rejected' where question_id = p_question_id;
  insert into question_actions (question_id, action, reason_code, reason_text, quota_returned, counselor_id)
  values (p_question_id, 'reject', p_code, nullif(btrim(coalesce(p_text, '')), ''), v_returned, p_counselor_id);
  return jsonb_build_object('rejected', true, 'quota_returned', v_returned);
end;
$$;

-- 破棄（区分 G1〜G4）。投稿枠は返さない。破棄が一定回数に達したら投稿機能を止める（要件 6.4.4・6.4.6）
create or replace function staff_discard_question(p_question_id uuid, p_counselor_id uuid, p_code text, p_text text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_q questions%rowtype;
  v_count int := 0;
  v_suspended boolean := false;
begin
  if p_code not in ('G1', 'G2', 'G3', 'G4') then raise exception 'invalid_code' using errcode = '22023'; end if;
  if btrim(coalesce(p_text, '')) = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_q from questions where question_id = p_question_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_q.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;

  update questions set status = 'discarded' where question_id = p_question_id;
  insert into question_actions (question_id, action, reason_code, reason_text, quota_returned, counselor_id)
  values (p_question_id, 'discard', p_code, btrim(p_text), false, p_counselor_id);

  if v_q.account_id is not null then
    select count(*) into v_count from questions where account_id = v_q.account_id and status = 'discarded';
    -- 【仮】3回で停止（未決事項 No.32）。閲覧と相談は止めない
    if v_count >= setting_int('qa_discard_suspend', 3) then
      update accounts set posting_suspended = true where account_id = v_q.account_id and not posting_suspended;
      v_suspended := found;
    end if;
  end if;
  return jsonb_build_object('discarded', true, 'discard_count', v_count, 'suspended', v_suspended);
end;
$$;

-- 既存のQ&Aへマージ。投稿枠は必ず返す（却下の返却上限とは別枠：要件 6.5）
create or replace function staff_merge_question(p_question_id uuid, p_counselor_id uuid, p_into uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_q questions%rowtype;
  v_into questions%rowtype;
begin
  select * into v_q from questions where question_id = p_question_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_q.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  select * into v_into from questions where question_id = p_into;
  if not found or p_into = p_question_id or not qa_is_public(v_into) then
    raise exception 'invalid_merge_target' using errcode = '22023';
  end if;

  if v_q.account_id is not null then
    update post_quotas set used = greatest(used - 1, returned)
    where account_id = v_q.account_id and year_month = to_char(v_q.posted_at at time zone 'Asia/Tokyo', 'YYYY-MM');
  end if;
  update questions set status = 'merged', merged_into = p_into where question_id = p_question_id;
  insert into question_actions (question_id, action, quota_returned, counselor_id) values (p_question_id, 'merge', true, p_counselor_id);
  return jsonb_build_object('merged', true);
end;
$$;

-- 通報（要件 2.8）。未対応の通報が一定数に達したら、自動で一時非公開にする
create or replace function user_report_question(p_account_id uuid, p_question_id uuid, p_code text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_q questions%rowtype;
  v_open int;
  v_hidden boolean := false;
begin
  if p_code not in ('identifiable', 'inappropriate', 'incorrect', 'other') then raise exception 'invalid_code' using errcode = '22023'; end if;
  select * into v_q from questions where question_id = p_question_id for update;
  if not found or not qa_is_public(v_q) then raise exception 'not_found' using errcode = 'P0002'; end if;
  begin
    insert into reports (question_id, reporter_account_id, reason_code) values (p_question_id, p_account_id, p_code);
  exception when unique_violation then
    raise exception 'already_reported' using errcode = '22023';
  end;
  select count(*) into v_open from reports where question_id = p_question_id and resolution is null;
  -- 【仮】5件（未決事項 No.52）
  if v_open >= setting_int('qa_report_auto_hide', 5) then
    update questions set unpublished_at = now(), unpublish_reason = 'auto_report' where question_id = p_question_id;
    v_hidden := true;
  end if;
  return jsonb_build_object('reported', true, 'auto_hidden', v_hidden);
end;
$$;

-- 無料会員が回答の全文を読む（月3本まで。一度開いた記事は以後も読める）
create or replace function user_unlock_answer(p_account_id uuid, p_question_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_ym text := to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM');
  v_used int;
begin
  perform 1 from accounts where account_id = p_account_id and deleted_at is null for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from questions q where q.question_id = p_question_id and qa_is_public(q)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select count(*) into v_used from qa_full_reads where account_id = p_account_id and year_month = v_ym;
  if exists (select 1 from qa_full_reads where account_id = p_account_id and question_id = p_question_id) then
    return jsonb_build_object('unlocked', true, 'remaining', greatest(3 - v_used, 0));
  end if;
  if v_used >= 3 then raise exception 'read_quota_exceeded' using errcode = '22023'; end if;
  insert into qa_full_reads (account_id, question_id, year_month) values (p_account_id, p_question_id, v_ym);
  return jsonb_build_object('unlocked', true, 'remaining', 3 - v_used - 1);
end;
$$;

-- 似た質問（公開中のQ&Aから。投稿前の提示と、管理側の候補表示に使う：要件 2.7）
create or replace function qa_similar(p_text text, p_limit int default 5, p_exclude uuid default null)
returns table (question_id uuid, body text, score real)
language sql stable
set search_path = public, extensions
as $$
  select q.question_id, q.body, similarity(q.body, p_text) as score
  from questions q
  where qa_is_public(q) and q.question_id is distinct from p_exclude and similarity(q.body, p_text) > 0.08
  order by score desc
  limit least(greatest(p_limit, 1), 20);
$$;

-- 閲覧数を1増やす
create or replace function qa_count_view(p_question_id uuid)
returns void language sql
set search_path = public
as $$ update questions set view_count = view_count + 1 where question_id = p_question_id $$;

-- ============================================================
-- 2) 機能3：動画
-- ============================================================
alter table videos
  add column description text,
  add column sort_order  int not null default 0,
  add column created_at  timestamptz not null default now();
create index idx_video_views_video on video_views (video_id);

-- ============================================================
-- 3) ランディングページ（要件 8.6.2）
--    クライアントコードは、招待コードとは別の、推測できないランダムな文字列。URL にだけ使い、認証には使わない
-- ============================================================
alter table landing_pages
  add column client_code text unique,
  add column updated_at  timestamptz not null default now(),
  add column updated_by  uuid;

-- ============================================================
-- 4) 添付画像（要件 3.8）。【仮】保管先は Supabase Storage の非公開バケット（未決事項 No.81）
--    ブラウザにはバケットの権限を与えない。読み書きはサーバールート（service role）だけが行う
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-attachments', 'case-attachments', false, 4194304, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

alter table attachments add column byte_size int, add column created_at timestamptz not null default now();
create index idx_attachments_message on attachments (message_id);

-- 物理削除のとき、DB からは保管先のファイルを消せないため、消すべきファイルをここに積む。
-- 管理側のサーバールートが、保管先から消して done_at を入れる
create table storage_purge_queue (
  queue_id   bigint generated always as identity primary key,
  bucket     text not null,
  file_ref   text not null,
  queued_at  timestamptz not null default now(),
  done_at    timestamptz,
  last_error text
);
alter table storage_purge_queue enable row level security;

create or replace function system_purge_deleted()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_req record;
  v_done int := 0;
  v_failed int := 0;
begin
  for v_req in
    select request_id, target_id
    from deletion_requests
    where target_type = 'case' and execution_status = 'pending' and purge_after <= now()
    for update skip locked
  loop
    begin
      insert into storage_purge_queue (bucket, file_ref)
      select 'case-attachments', a.file_ref
      from attachments a join messages m on m.message_id = a.message_id
      where m.case_id = v_req.target_id;
      delete from attachments where message_id in (select message_id from messages where case_id = v_req.target_id);
      delete from messages where case_id = v_req.target_id;
      delete from case_survey_answers where case_id = v_req.target_id;
      delete from case_summaries where case_id = v_req.target_id;
      delete from case_reads where case_id = v_req.target_id;
      delete from reply_drafts where case_id = v_req.target_id;
      delete from reuse_consents where case_id = v_req.target_id;
      update deletion_requests set execution_status = 'done', executed_at = now() where request_id = v_req.request_id;
      insert into audit_logs (actor_type, action, target_type, target_id) values ('system', 'case.purge', 'cases', v_req.target_id);
      v_done := v_done + 1;
    exception when others then
      update deletion_requests set execution_status = 'failed', executed_at = now() where request_id = v_req.request_id;
      v_failed := v_failed + 1;
    end;
  end loop;
  return jsonb_build_object('done', v_done, 'failed', v_failed);
end;
$$;

-- ============================================================
-- 5) 運営機能の残り
-- ============================================================

-- 開示請求（要件 7.13.2）
alter table disclosure_requests
  add column note        text,
  add column created_by  uuid,
  add column completed_by uuid;

-- 画面・メッセージ内の自動文面（要件 7.14.3）。client_id が NULL の行が全体の既定、値がある行がクライアント別の上書き
create table auto_texts (
  text_key   text not null,
  client_id  uuid references clients(client_id),
  body       text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create unique index uq_auto_texts on auto_texts (text_key, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table auto_texts enable row level security;

-- メールテンプレートの初期値（要件 7.14.1）。【仮】文案。メール配信サービスが未決のため、まだ送信には使っていない。
-- 件名・本文に、相談の内容を示す語を入れない（要件 10.2.1）
insert into mail_templates (template_key, subject, body) values
  ('reply_received',    '【ダイヤル.com】新しいお知らせがあります', E'ログインしてご確認ください。\n{ログインURL}'),
  ('case_closed',       '【ダイヤル.com】新しいお知らせがあります', E'ログインしてご確認ください。\n{ログインURL}'),
  ('idle_close_notice', '【ダイヤル.com】新しいお知らせがあります', E'ログインしてご確認ください。\n{ログインURL}'),
  ('qa_published',      '【ダイヤル.com】ご投稿についてのお知らせ', E'ご投稿（{表示ID}）について、お知らせがあります。ログインしてご確認ください。\n{ログインURL}'),
  ('qa_rejected',       '【ダイヤル.com】ご投稿についてのお知らせ', E'ご投稿（{表示ID}）について、お知らせがあります。ログインしてご確認ください。\n{ログインURL}'),
  ('reuse_request',     '【ダイヤル.com】ご確認のお願い', E'ご確認いただきたいことがあります。ログインしてご確認ください。\n{ログインURL}'),
  ('membership_ended',  '【ダイヤル.com】ご利用についてのお知らせ', E'ご利用の入口が変わりました。今後は次のページからログインしてください。\n{ログインURL}')
on conflict (template_key) do nothing;

-- 二次利用同意（要件 9.4・7.13.3）。利用者が画面で答える
create or replace function user_answer_reuse(p_account_id uuid, p_case_id uuid, p_agree boolean)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_r reuse_consents%rowtype;
begin
  if not exists (select 1 from cases where case_id = p_case_id and account_id = p_account_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into v_r from reuse_consents where case_id = p_case_id for update;
  if not found or v_r.status <> 'requested' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_r.expires_at is not null and v_r.expires_at <= now() then
    update reuse_consents set status = 'expired' where case_id = p_case_id;
    return jsonb_build_object('status', 'expired');
  end if;
  update reuse_consents set status = case when p_agree then 'agreed' else 'declined' end, responded_at = now() where case_id = p_case_id;
  if p_agree then
    insert into consents (account_id, doc_type, doc_version) values (p_account_id, 'reuse', 'case:' || p_case_id::text);
  end if;
  return jsonb_build_object('status', case when p_agree then 'agreed' else 'declined' end);
end;
$$;

-- 期限を過ぎた同意の依頼を失効させる（1日1回）
create or replace function system_expire_reuse_requests()
returns int
language plpgsql
set search_path = public
as $$
declare v_n int;
begin
  update reuse_consents set status = 'expired' where status = 'requested' and expires_at is not null and expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
select cron.schedule('expire-reuse-requests', '41 18 * * *', $cron$select public.system_expire_reuse_requests()$cron$);

-- 予約公開の動画を、時刻が来たら公開にする（10分ごと）
create or replace function system_publish_scheduled_videos()
returns int
language plpgsql
set search_path = public
as $$
declare v_n int;
begin
  update videos set status = 'published', updated_at = now()
  where status = 'scheduled' and published_at is not null and published_at <= now()
    and not (scope_personal = 'none' and scope_business = 'none');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
select cron.schedule('publish-scheduled-videos', '*/10 * * * *', $cron$select public.system_publish_scheduled_videos()$cron$);

-- ============================================================
-- 6) 実行権限：上の関数は service_role のみ
-- ============================================================
do $$
declare f text;
begin
  foreach f in array array[
    'qa_is_public(questions)',
    'user_post_question(uuid, uuid, text, uuid)',
    'staff_publish_question(uuid, uuid, text, text)',
    'staff_reject_question(uuid, uuid, text, text)',
    'staff_discard_question(uuid, uuid, text, text)',
    'staff_merge_question(uuid, uuid, uuid)',
    'user_report_question(uuid, uuid, text)',
    'user_unlock_answer(uuid, uuid)',
    'qa_similar(text, int, uuid)',
    'qa_count_view(uuid)',
    'system_purge_deleted()',
    'user_answer_reuse(uuid, uuid, boolean)',
    'system_expire_reuse_requests()',
    'system_publish_scheduled_videos()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
