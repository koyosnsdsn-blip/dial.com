-- 通知用のメールアドレス（2026-10-08 ダイヤルさんの指示：A案の土台）
--
-- 【経緯】ニックネームで登録した相談者のログインIDは、受信できない内部用アドレス（u-…@内部ドメイン）。
--   そのため、新しいお返事の通知も、パスワードを忘れたときの再設定も届かない。
--   ログインIDは変えず、通知とパスワード再設定の届け先として、任意でメールアドレスを登録できるようにする。
--
-- 【仮】
--   - 登録直後は「確認前」（verified_at = null）。確認前のアドレスには何も送らない（他人のアドレスの悪用を防ぐ）。
--   - 確認メールの送信・確認の完了は、メール配信の仕組み（未決事項 No.59）ができてから接続する。いまは、保存と表示だけ。
--   - ブラウザからは読み書きできない（サーバールート経由。ほかの相談者の通知用アドレスを読めないようにする）。
--   - 同じアドレスを複数のアカウントに登録することは、いまは妨げない。パスワード再設定に使う段階で、扱いを決める（未決事項一覧 2.17）。
--   - 退会したら削除する。

create table if not exists public.account_notify_emails (
  account_id    uuid primary key references public.accounts(account_id),
  email         citext not null check (length(email::text) <= 254 and email::text ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.account_notify_emails is '通知・パスワード再設定の届け先（任意）。verified_at が null の間は、何も送らない。ブラウザからは読み書きしない';

alter table public.account_notify_emails enable row level security;
revoke all on public.account_notify_emails from anon, authenticated;
grant all on public.account_notify_emails to service_role;

-- 退会（accounts.deleted_at が入る）と同時に、通知用アドレスを消す
create or replace function public.delete_notify_email_on_withdraw()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from account_notify_emails where account_id = new.account_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delete_notify_email_on_withdraw on public.accounts;
create trigger trg_delete_notify_email_on_withdraw
  after update of deleted_at on public.accounts
  for each row execute function public.delete_notify_email_on_withdraw();
