-- 運営まわりの追加：返信テンプレート・返信の下書き・公的窓口の一覧・問い合わせ、削除の実行、退会
--
-- 追加するテーブルはすべて RLS を有効にし、ポリシーは作らない（ブラウザからは全拒否）。
-- 読み書きは各アプリのサーバールート（service_role）のみ。

-- ============================================================
-- 1) 返信テンプレート（要件 7.15）。相談員の氏名を含めないこと（3.6.1）
-- ============================================================
create table reply_templates (
  template_id  uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  sort_order   int not null default 0,
  active       boolean not null default true,
  updated_by   uuid references counselors(counselor_id),
  updated_at   timestamptz not null default now()
);
alter table reply_templates enable row level security;

-- ============================================================
-- 2) 返信の下書き（要件 7.3）。案件×相談員ごとに1件。送信したら消す
-- ============================================================
create table reply_drafts (
  case_id       uuid not null references cases(case_id) on delete cascade,
  counselor_id  uuid not null references counselors(counselor_id) on delete cascade,
  body          text not null,
  updated_at    timestamptz not null default now(),
  primary key (case_id, counselor_id)
);
comment on table reply_drafts is '相談員の返信の下書き。相談内容に準じて扱う（ブラウザから直接読めない）';
alter table reply_drafts enable row level security;

-- ============================================================
-- 3) 公的窓口の一覧（要件 3.5・7.15）。緊急時の案内ページに表示する。相談員チームが維持管理する
-- ============================================================
create table public_contacts (
  contact_id  uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  hours       text,
  note        text,
  url         text,
  sort_order  int not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public_contacts enable row level security;

-- ============================================================
-- 4) 問い合わせ（要件 10.5）。運営に対する問い合わせで、相談（機能2）とは別。相談内容を書かないよう案内する
-- ============================================================
create table inquiries (
  inquiry_id   uuid primary key default gen_random_uuid(),
  account_id   uuid references accounts(account_id),
  category     text not null check (category in ('usage', 'account', 'deletion', 'disclosure', 'other')),
  body         text not null,
  status       text not null default 'open' check (status in ('open', 'done')),
  created_at   timestamptz not null default now(),
  handled_by   uuid references counselors(counselor_id),
  handled_at   timestamptz,
  note         text
);
alter table inquiries enable row level security;

-- ============================================================
-- 5) 削除の実行（要件 9.3・7.13.1）：猶予期間を過ぎた削除依頼について、相談内容を物理削除する
--    消すもの：メッセージ（添付を含む）、アンケートの回答、相談サマリ、既読記録、返信の下書き
--    残すもの：案件の行（日時・状態などのメタデータ）、利用権、監査ログ
--    失敗した依頼は execution_status = 'failed' にして、管理画面で気づけるようにする
-- ============================================================
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
      delete from attachments where message_id in (select message_id from messages where case_id = v_req.target_id);
      delete from messages where case_id = v_req.target_id;
      delete from case_survey_answers where case_id = v_req.target_id;
      delete from case_summaries where case_id = v_req.target_id;
      delete from case_reads where case_id = v_req.target_id;
      delete from reply_drafts where case_id = v_req.target_id;
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

revoke execute on function system_purge_deleted() from public, anon, authenticated;
grant execute on function system_purge_deleted() to service_role;

-- 1日1回（日本時間 3:23）
select cron.schedule('purge-deleted', '23 18 * * *', $cron$select public.system_purge_deleted()$cron$);

-- ============================================================
-- 6) 退会（要件 10.3.3・9.3）
--    - 対応中の相談があれば終了する（close_reason = 'manual'）
--    - すべての相談を削除の扱いにする（即時に非表示、猶予期間の経過後に物理削除）
--    - 会員の識別情報を不可逆に消す：accounts のメールアドレス・所属、Auth 側のメールアドレス・パスワード・
--      ニックネーム・ログイン情報。以後ログインできない。同じニックネーム・メールアドレスは新規登録に使える
--    - 監査ログ・決済記録は残す（9.3）
--    auth スキーマを更新するため SECURITY DEFINER とする。実行できるのは service_role のみ
-- ============================================================
create or replace function user_withdraw(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purge timestamptz := now() + make_interval(days => setting_int('deletion_grace_days', 30));
  v_cases int := 0;
  v_case record;
begin
  perform 1 from accounts where account_id = p_account_id and deleted_at is null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- 運営側のアカウントは対象外（相談員の登録まで壊してしまうため）
  if exists (select 1 from counselors where counselor_id = p_account_id) then
    raise exception 'staff_account' using errcode = '22023';
  end if;

  update cases
  set status = 'closed', close_reason = 'manual', closed_at = now(), awaiting_reply_since = null
  where account_id = p_account_id and status = 'open';

  for v_case in
    select c.case_id from cases c
    where c.account_id = p_account_id
      and not exists (select 1 from deletion_requests d where d.target_type = 'case' and d.target_id = c.case_id)
  loop
    update messages set hidden_at = now(), purge_after = v_purge where case_id = v_case.case_id and hidden_at is null;
    insert into deletion_requests (account_id, target_type, target_id, purge_after)
    values (p_account_id, 'case', v_case.case_id, v_purge);
    v_cases := v_cases + 1;
  end loop;

  delete from account_attributes where account_id = p_account_id;
  update accounts
  set deleted_at = now(), email = null, client_id = null, tier = 'free'
  where account_id = p_account_id;

  -- Auth 側の識別情報を消し、ログインできないようにする
  update auth.users
  set email = 'deleted-' || id::text || '@deleted.dialcom-op-dev.vercel.app',
      encrypted_password = null,
      raw_user_meta_data = '{}'::jsonb,
      banned_until = '2999-01-01T00:00:00Z'::timestamptz,
      email_change = '',
      phone = null
  where id = p_account_id;
  delete from auth.sessions where user_id = p_account_id;
  delete from auth.identities where user_id = p_account_id;

  return jsonb_build_object('withdrawn', true, 'cases', v_cases);
end;
$$;

revoke execute on function user_withdraw(uuid) from public, anon, authenticated;
grant execute on function user_withdraw(uuid) to service_role;
