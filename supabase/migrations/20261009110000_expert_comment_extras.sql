-- 先生コメントの追加機能（2026-10-09。docs/未決事項一覧_統合版.md 2.19）
--   expert_comment_reports  … 先生コメントの通報（利用者→運営）。通報者への結果通知はしない（7.11.3 と同じ）
--   expert_comment_helpful  … 「参考になった」（利用者1人につき、コメント1件に1回）
--   user_report_expert_comment() … 通報の受付。未対応の通報が一定数に達したら、コメントを自動で非表示にする
--   user_set_comment_helpful()   … 「参考になった」の付け外し
-- どちらもブラウザからは読み書きしない（サーバールート経由）。
-- 通報・「参考になった」は質問（記事）に紐づくコメントにだけ付く。質問が削除されればコメントごと消える（on delete cascade）。

create table expert_comment_reports (
  report_id           uuid primary key default gen_random_uuid(),
  comment_id          uuid not null references expert_comments(comment_id) on delete cascade,
  reporter_account_id uuid references accounts(account_id),   -- 退会時に null にする
  reason_code         text not null check (reason_code in ('identifiable', 'inappropriate', 'incorrect', 'other')),
  reported_at         timestamptz not null default now(),
  resolution          text check (resolution in ('hidden', 'dismissed')),
  resolved_at         timestamptz,
  resolved_by         uuid references counselors(counselor_id),
  resolution_note     text check (resolution_note is null or length(resolution_note) <= 500)
);
-- 同じ利用者は、同じコメントを対応が済むまで1回だけ通報できる
create unique index uq_expert_comment_reports_open on expert_comment_reports (comment_id, reporter_account_id) where resolution is null;
create index ix_expert_comment_reports_open on expert_comment_reports (comment_id) where resolution is null;

create table expert_comment_helpful (
  comment_id  uuid not null references expert_comments(comment_id) on delete cascade,
  account_id  uuid not null references accounts(account_id),
  created_at  timestamptz not null default now(),
  primary key (comment_id, account_id)
);

comment on table expert_comment_reports is '先生コメントの通報。通報者への結果通知は行わない。退会時に reporter_account_id を null にする';
comment on table expert_comment_helpful is '「参考になった」。退会時に削除する';

alter table expert_comment_reports enable row level security;
alter table expert_comment_helpful enable row level security;
revoke all on expert_comment_reports, expert_comment_helpful from anon, authenticated;
grant all on expert_comment_reports, expert_comment_helpful to service_role;

-- 通報の受付
create or replace function user_report_expert_comment(p_account_id uuid, p_comment_id uuid, p_code text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_c expert_comments%rowtype;
  v_q questions%rowtype;
  v_open int;
  v_hidden boolean := false;
begin
  if p_code not in ('identifiable', 'inappropriate', 'incorrect', 'other') then raise exception 'invalid_code' using errcode = '22023'; end if;
  select * into v_c from expert_comments where comment_id = p_comment_id for update;
  if not found or v_c.status <> 'published' then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_q from questions where question_id = v_c.question_id;
  if not found or not qa_is_public(v_q) then raise exception 'not_found' using errcode = 'P0002'; end if;
  begin
    insert into expert_comment_reports (comment_id, reporter_account_id, reason_code) values (p_comment_id, p_account_id, p_code);
  exception when unique_violation then
    raise exception 'already_reported' using errcode = '22023';
  end;
  select count(*) into v_open from expert_comment_reports where comment_id = p_comment_id and resolution is null;
  -- 【仮】記事の通報と同じ件数（system_settings の qa_report_auto_hide。既定 5。未決事項 No.52）
  if v_open >= setting_int('qa_report_auto_hide', 5) then
    update expert_comments set status = 'hidden' where comment_id = p_comment_id and status = 'published';
    v_hidden := true;
  end if;
  return jsonb_build_object('reported', true, 'auto_hidden', v_hidden);
end;
$$;

-- 「参考になった」の付け外し（公開中のコメントにだけ付けられる）
create or replace function user_set_comment_helpful(p_account_id uuid, p_comment_id uuid, p_on boolean)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_c expert_comments%rowtype;
  v_q questions%rowtype;
  v_count int;
begin
  select * into v_c from expert_comments where comment_id = p_comment_id;
  if not found or v_c.status <> 'published' then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_q from questions where question_id = v_c.question_id;
  if not found or not qa_is_public(v_q) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_on then
    insert into expert_comment_helpful (comment_id, account_id) values (p_comment_id, p_account_id) on conflict do nothing;
  else
    delete from expert_comment_helpful where comment_id = p_comment_id and account_id = p_account_id;
  end if;
  select count(*) into v_count from expert_comment_helpful where comment_id = p_comment_id;
  return jsonb_build_object('on', p_on, 'count', v_count);
end;
$$;

revoke execute on function user_report_expert_comment(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function user_set_comment_helpful(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function user_report_expert_comment(uuid, uuid, text) to service_role;
grant execute on function user_set_comment_helpful(uuid, uuid, boolean) to service_role;

-- 退会（accounts.deleted_at が入る）と同時に、通報者の紐づけと「参考になった」を消す
create or replace function scrub_expert_comment_activity_on_withdraw()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update expert_comment_reports set reporter_account_id = null where reporter_account_id = new.account_id;
    delete from expert_comment_helpful where account_id = new.account_id;
  end if;
  return new;
end;
$$;

create trigger trg_scrub_expert_comment_activity_on_withdraw
  after update of deleted_at on accounts
  for each row execute function scrub_expert_comment_activity_on_withdraw();

revoke execute on function scrub_expert_comment_activity_on_withdraw() from public, anon, authenticated;
