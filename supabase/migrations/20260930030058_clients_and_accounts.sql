-- データモデル設計.md 第1章：契約・アカウント
--
-- 認証方針（技術基盤設計書 v1.1 §2）：
-- accounts / counselors / client_admins はいずれも Supabase Auth (auth.users) に登録する。
-- password_hash 列は持たない。各テーブルの PK は auth.users.id への参照とする。

create table clients (
  client_id           uuid primary key default gen_random_uuid(),
  name                text not null,
  contract_type       text not null check (contract_type in ('corp', 'muni')),
  status              text not null default 'prep' check (status in ('prep', 'active', 'closed')),
  contract_start      date,
  contract_end        date,
  employee_count      int,              -- 企業契約型のみ
  assumed_usage_rate  numeric,          -- 企業契約型のみ
  invite_code         text unique,      -- 推測困難なランダム文字列
  feature_qa          boolean not null default false,
  feature_consult     boolean not null default false,
  feature_video       boolean not null default false,
  sla_hours           int not null default 24,
  rally_max           int not null default 1,  -- 企業枠の既定（3.2.5）
  created_at          timestamptz not null default now()
);

comment on column clients.contract_type is '登録後に変更できない（要件定義書3.12.2）。下記トリガで更新を禁止する';

-- 制約#1（データモデル設計 8章）：contract_type は更新できない
create or replace function forbid_contract_type_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.contract_type is distinct from old.contract_type then
    raise exception 'clients.contract_type is immutable';
  end if;
  return new;
end;
$$;

create trigger trg_forbid_contract_type_update
  before update on clients
  for each row
  execute function forbid_contract_type_update();

-- 制約#2：feature_qa / feature_consult / feature_video が全て false になる更新を拒否
create or replace function forbid_all_features_disabled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.feature_qa = false and new.feature_consult = false and new.feature_video = false then
    raise exception 'clients must have at least one feature enabled';
  end if;
  return new;
end;
$$;

create trigger trg_forbid_all_features_disabled
  before insert or update on clients
  for each row
  execute function forbid_all_features_disabled();


create table accounts (
  account_id          uuid primary key references auth.users(id) on delete cascade,
  email               citext unique,
  tier                text not null default 'free' check (tier in ('free', 'paid', 'member')),
  client_id           uuid references clients(client_id),  -- 個人利用者は NULL
  posting_suspended   boolean not null default false,
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table accounts is '氏名を保持しない（要件定義書3.10.5）。認証情報は auth.users に存在する';


create table client_admins (
  admin_id            uuid primary key references auth.users(id) on delete cascade,
  client_id           uuid not null references clients(client_id),
  name                text not null,  -- 契約の窓口担当者のため氏名を持つ（7.6.5）
  email               citext,
  last_login_at       timestamptz,
  status              text not null default 'active' check (status in ('active', 'expired'))
);

-- 制約#7：client_admins は1つの client_id について active な行を1件以上保つ
create or replace function check_client_admin_min_active()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_count int;
begin
  -- 「元の client_id から active な管理者が1人減る」操作（削除／非activeへの変更／別client_idへの付け替え）のみ検査する
  if old.status = 'active'
     and (tg_op = 'DELETE'
          or new.status <> 'active'
          or new.client_id is distinct from old.client_id) then
    -- 自分自身を除いた、同じ client_id の active 管理者数
    select count(*) into active_count
    from client_admins
    where client_id = old.client_id
      and status = 'active'
      and admin_id <> old.admin_id;

    if active_count = 0 then
      raise exception 'client_id % must keep at least one active client_admin', old.client_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_check_client_admin_min_active
  before update or delete on client_admins
  for each row
  execute function check_client_admin_min_active();


create table landing_pages (
  client_id           uuid primary key references clients(client_id),
  logo_ref            text,  -- PNG/JPEG のみ（アプリ側で検証）
  comment_text        text,
  contact_text        text,
  accent_color        text,
  published_at        timestamptz,
  published_by        uuid references client_admins(admin_id)
);

create table client_counselors (
  client_id           uuid not null references clients(client_id),
  counselor_id        uuid not null,  -- FK は 008_ops_audit.sql の counselors 作成後に追加
  primary key (client_id, counselor_id)
);

create table consents (
  consent_id          uuid primary key default gen_random_uuid(),
  account_id          uuid not null references accounts(account_id),
  doc_type            text not null check (doc_type in ('terms', 'privacy', 'reuse', 'muni_report', 'cross_border')),
  doc_version         text not null,
  agreed_at           timestamptz not null default now()
);

create table sessions (
  session_id          uuid primary key default gen_random_uuid(),
  account_id          uuid not null references accounts(account_id),
  device_label        text,
  last_seen_at        timestamptz not null default now()
);

create table notification_settings (
  account_id          uuid not null references accounts(account_id),
  kind                text not null,
  enabled             boolean not null default true,
  show_service_name   boolean not null default true,
  primary key (account_id, kind)
);
