-- 役割ごとのログインID（未決事項一覧 2.13 の③）。
-- 相談員・運営管理者の Supabase Auth 上のメールアドレスは、内部用の識別子（s-…@内部ドメイン）にする。
-- 本物のメールアドレスは、ここ（contact_email）に持つ。クライアント管理者は client_admins.email に持っている。
-- 認証用の識別子の書き換え（auth.users / auth.identities）は、内部ドメインの値に依存するため、このマイグレーションでは行わない。
-- （docs/未決事項一覧_統合版.md 2.13 の手順で、デプロイの直後に一度だけ実行する）

alter table public.counselors add column if not exists contact_email text;

-- 現在の認証用メールアドレスを、連絡先として写す（書き換えの前に実行すること）
update public.counselors c
   set contact_email = lower(u.email)
  from auth.users u
 where u.id = c.counselor_id
   and c.contact_email is null
   and u.email is not null
   and u.email !~ '^[usc]-[0-9a-f]{40}@';

create unique index if not exists counselors_contact_email_key
  on public.counselors (lower(contact_email))
  where contact_email is not null;

comment on column public.counselors.contact_email is '連絡先のメールアドレス（本物）。ログインには使わない。Auth 上のアドレスは s-…@内部ドメイン の識別子';
