-- データモデル設計.md 第3章：機能2（相談）
--
-- 重要：cases / messages / case_summaries / emergency_records / case_survey_answers は
-- CLAUDE.md 制約#1・#2 の対象（サーバールート限定アクセス＋RLS必須＋audit_logs記録）。
-- RLSポリシーは 00000000000010_rls.sql にまとめて定義する。

create table entitlements (
  entitlement_id      uuid primary key default gen_random_uuid(),
  account_id          uuid not null references accounts(account_id),
  source              text not null check (source in ('payment', 'client')),
  client_id           uuid references clients(client_id),   -- 企業枠のみ
  payment_id          uuid,  -- FK は 007_payment.sql の payments 作成後に追加。個人課金のみ
  rally_max           int not null,       -- 付与時点の複写（スナップショット原則）
  sla_hours           int not null,       -- 付与時点の複写
  expires_at          timestamptz,        -- 委託型・企業枠は NULL
  granted_at          timestamptz not null default now(),
  granted_free        boolean not null default false,  -- 6.4.5の無償付与

  -- 制約#9：source = 'client' の行は payment_id を持たない
  constraint chk_entitlements_client_no_payment
    check (not (source = 'client' and payment_id is not null))
);

create table cases (
  case_id             uuid primary key default gen_random_uuid(),
  entitlement_id      uuid not null unique references entitlements(entitlement_id),  -- 1対1
  account_id          uuid not null references accounts(account_id),
  client_id           uuid references clients(client_id),  -- 付与時点の複写。参照時点の accounts.client_id を使わない
  counselor_id        uuid,  -- FK は 008_ops_audit.sql の counselors 作成後に追加
  status              text not null default 'open' check (status in ('open', 'closed')),
  close_reason        text check (close_reason in ('rally', 'expiry', 'idle', 'manual')),
  urgent_flag         boolean not null default false,
  rally_used          int not null default 0,
  opened_at           timestamptz not null default now(),
  last_activity_at    timestamptz not null default now(),  -- 企業枠の自動クローズ起算。送信のたびに更新
  closed_at           timestamptz
);

comment on table cases is '相談内容系テーブル。ブラウザから直接アクセスしない（CLAUDE.md制約#1）';

-- 制約#4：1つの account_id について status='open' の行は1件まで
create unique index uq_cases_one_open_per_account
  on cases (account_id)
  where status = 'open';

create table messages (
  message_id          uuid primary key default gen_random_uuid(),
  case_id             uuid not null references cases(case_id),
  sender              text not null check (sender in ('user', 'counselor')),
  body                text not null,
  sent_at             timestamptz not null default now(),
  hidden_at           timestamptz,
  purge_after         timestamptz
);

comment on table messages is '相談内容系テーブル。sender区分のみ保持し、相談員を識別する列を持たない（3.6.1）';

create table attachments (
  attachment_id       uuid primary key default gen_random_uuid(),
  message_id          uuid not null references messages(message_id),
  file_ref            text not null,  -- 保管先は未確定（未決事項一覧 No.81）
  mime_type           text
);

create table rally_adjustments (
  adjustment_id       uuid primary key default gen_random_uuid(),
  case_id             uuid not null references cases(case_id),
  delta               int not null,
  reason              text,
  counselor_id        uuid,
  adjusted_at         timestamptz not null default now()
);

create table case_summaries (
  case_id             uuid primary key references cases(case_id),
  content             text,
  status              text not null default 'draft' check (status in ('draft', 'confirmed')),
  generated_at        timestamptz,
  confirmed_by        uuid,
  confirmed_at        timestamptz
);

comment on table case_summaries is '個人課金の案件のみ生成（3.9.2）。confirmed後は更新不可（制約#11、下記トリガ参照）';

create or replace function forbid_confirmed_summary_update()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'confirmed' then
    raise exception 'case_summaries: confirmed row is immutable (case_id=%)', old.case_id;
  end if;
  return new;
end;
$$;

create trigger trg_forbid_confirmed_summary_update
  before update on case_summaries
  for each row
  execute function forbid_confirmed_summary_update();

create table emergency_records (
  record_id           uuid primary key default gen_random_uuid(),
  case_id             uuid not null references cases(case_id),
  detection           text,
  judgment            text,
  action_taken        text,
  counselor_id        uuid,
  recorded_at         timestamptz not null default now()
);
