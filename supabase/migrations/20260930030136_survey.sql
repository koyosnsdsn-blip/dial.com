-- データモデル設計.md 第4章：アンケート

create table survey_questions (
  survey_question_id  uuid primary key default gen_random_uuid(),
  client_id           uuid references clients(client_id),  -- NULL は共通設問
  kind                text not null check (kind in ('attr', 'chief')),
  question_text       text not null,
  sort_order          int not null default 0,
  aggregatable        boolean not null default false,  -- 四半期レポートの集計対象
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- 制約#5：survey_questions は1つの client_id について active な行を2件まで
create or replace function check_survey_questions_active_max()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_count int;
begin
  if new.active and new.client_id is not null then
    select count(*) into active_count
    from survey_questions
    where client_id = new.client_id
      and active = true
      and survey_question_id <> new.survey_question_id;
    if active_count >= 2 then
      raise exception 'client_id % already has 2 active survey_questions', new.client_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_check_survey_questions_active_max
  before insert or update on survey_questions
  for each row
  execute function check_survey_questions_active_max();

create table survey_options (
  option_id           uuid primary key default gen_random_uuid(),
  survey_question_id  uuid not null references survey_questions(survey_question_id),
  label               text not null,
  sort_order          int not null default 0
);

create table account_attributes (
  account_id              uuid not null references accounts(account_id),
  survey_question_id      uuid not null references survey_questions(survey_question_id),
  question_text_snapshot  text not null,
  option_label_snapshot   text not null,
  answered_at             timestamptz not null default now(),
  updated_at              timestamptz,
  primary key (account_id, survey_question_id)
);

create table case_survey_answers (
  case_id                 uuid not null references cases(case_id),
  survey_question_id      uuid not null references survey_questions(survey_question_id),
  kind                    text not null check (kind in ('attr', 'chief')),
  question_text_snapshot  text not null,
  option_label_snapshot   text not null,
  primary key (case_id, survey_question_id)
);

comment on table case_survey_answers is '相談内容系テーブル。CLAUDE.md制約#1・#2の対象';
