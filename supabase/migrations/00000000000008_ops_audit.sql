-- データモデル設計.md 第7章：運営・監査・権利行使
--
-- counselors も Supabase Auth (auth.users) に登録する（技術基盤設計書 v1.1 §2）

create table counselors (
  counselor_id        uuid primary key references auth.users(id) on delete cascade,
  name                text not null,
  role                text not null check (role in ('admin', 'counselor')),
  status              text not null default 'active' check (status in ('active', 'expired')),
  absent_from         date,
  absent_to           date
);

comment on table counselors is 'counselors.name は利用者向け経路に載せない（3.6.1）';

-- ここまで前方参照していた counselor_id / counselors への FK をまとめて追加する
alter table client_counselors
  add constraint fk_client_counselors_counselor
  foreign key (counselor_id) references counselors(counselor_id);

alter table answers
  add constraint fk_answers_counselor
  foreign key (counselor_id) references counselors(counselor_id);

alter table question_actions
  add constraint fk_question_actions_counselor
  foreign key (counselor_id) references counselors(counselor_id);

alter table anonymization_edits
  add constraint fk_anonymization_edits_counselor
  foreign key (counselor_id) references counselors(counselor_id);

alter table cases
  add constraint fk_cases_counselor
  foreign key (counselor_id) references counselors(counselor_id);

alter table rally_adjustments
  add constraint fk_rally_adjustments_counselor
  foreign key (counselor_id) references counselors(counselor_id);

alter table case_summaries
  add constraint fk_case_summaries_confirmed_by
  foreign key (confirmed_by) references counselors(counselor_id);

alter table emergency_records
  add constraint fk_emergency_records_counselor
  foreign key (counselor_id) references counselors(counselor_id);


create table audit_logs (
  log_id              bigint generated always as identity primary key,
  actor_type          text not null check (actor_type in ('counselor', 'client_admin', 'account', 'system')),
  actor_id            uuid,
  action              text not null,
  target_type         text not null,
  target_id           uuid,
  reason              text,
  acted_at            timestamptz not null default now()
);

comment on table audit_logs is '追記専用。UPDATE/DELETEのポリシーを設定しない（7.16、制約#8）';

-- 制約#8：audit_logs への UPDATE / DELETE を許可しない（RLS未使用時のDB層フェイルセーフ）
create or replace function forbid_audit_logs_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only: % is not allowed', tg_op;
end;
$$;

create trigger trg_forbid_audit_logs_update
  before update on audit_logs
  for each row
  execute function forbid_audit_logs_mutation();

create trigger trg_forbid_audit_logs_delete
  before delete on audit_logs
  for each row
  execute function forbid_audit_logs_mutation();


create table deletion_requests (
  request_id          uuid primary key default gen_random_uuid(),
  account_id          uuid not null references accounts(account_id),
  target_type         text not null,
  target_id           uuid not null,
  requested_at        timestamptz not null default now(),
  purge_after         timestamptz,
  executed_at         timestamptz,
  execution_status    text not null default 'pending' check (execution_status in ('pending', 'done', 'failed'))
);

create table disclosure_requests (
  request_id          uuid primary key default gen_random_uuid(),
  account_id          uuid not null references accounts(account_id),
  requested_at        timestamptz not null default now(),
  verified_at         timestamptz,
  due_at              timestamptz,
  completed_at        timestamptz
);

create table reuse_consents (
  case_id             uuid primary key references cases(case_id),
  status              text not null default 'unrequested'
                        check (status in ('unrequested', 'requested', 'agreed', 'declined', 'expired')),
  requested_at        timestamptz,
  responded_at        timestamptz,
  expires_at          timestamptz
);

create table mail_templates (
  template_id         uuid primary key default gen_random_uuid(),
  template_key        text unique not null,
  subject             text not null,
  body                text not null,
  version             int not null default 1,
  updated_at          timestamptz not null default now()
);

create table notices (
  notice_id           uuid primary key default gen_random_uuid(),
  body                text not null,
  target              text not null check (target in ('all', 'member', 'client', 'personal')),
  client_id           uuid references clients(client_id),
  display_from        timestamptz,
  display_to          timestamptz
);

create table system_settings (
  setting_key         text primary key,
  setting_value       text,
  updated_by          uuid references counselors(counselor_id),
  updated_at          timestamptz not null default now()
);

comment on table system_settings is 'ラリー回数・有効期間・各種閾値を保持する（7.18）';
