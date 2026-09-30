-- データモデル設計.md 第2章：機能1（会員投稿型Q&A）

create table genres (
  genre_id            uuid primary key default gen_random_uuid(),
  name                text not null,
  sort_order          int not null default 0
);

create table questions (
  question_id         uuid primary key default gen_random_uuid(),
  account_id          uuid not null references accounts(account_id),  -- 内部用。公開しない
  display_id          text unique,   -- 使い捨て。投稿ごとに発行。公開画面ではこれのみ表示
  genre_id            uuid references genres(genre_id),
  body                text not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'published', 'rejected', 'discarded', 'merged')),
  merged_into         uuid references questions(question_id),
  operator_created    boolean not null default false,  -- 運営作成記事は display_id を持たない
  posted_at           timestamptz not null default now(),
  published_at        timestamptz,
  hidden_at           timestamptz,
  purge_after         timestamptz
);

comment on column questions.account_id is '公開経路（APIレスポンス）に含めないこと。技術基盤設計書 0.3参照';

create table answers (
  answer_id           uuid primary key default gen_random_uuid(),
  question_id         uuid not null references questions(question_id),
  counselor_id        uuid not null,  -- FK は 008_ops_audit.sql の counselors 作成後に追加
  body                text not null,
  published_at        timestamptz,
  updated_at          timestamptz
);

create table question_actions (
  action_id           uuid primary key default gen_random_uuid(),
  question_id         uuid not null references questions(question_id),
  action              text not null check (action in ('publish', 'reject', 'discard', 'merge', 'anonymize')),
  reason_code         text check (reason_code in ('B', 'E', 'F', 'G1', 'G2', 'G3', 'G4')),
  reason_text         text,
  quota_returned      boolean not null default false,  -- 破棄（G区分）は false（6.4.6）
  counselor_id        uuid,
  acted_at            timestamptz not null default now()
);

create table anonymization_edits (
  edit_id             uuid primary key default gen_random_uuid(),
  question_id         uuid not null references questions(question_id),
  before_text         text not null,
  after_text          text not null,
  counselor_id        uuid,
  edited_at           timestamptz not null default now()
);

create table reports (
  report_id           uuid primary key default gen_random_uuid(),
  question_id         uuid not null references questions(question_id),
  reporter_account_id uuid references accounts(account_id),
  reason_code         text,
  resolution          text check (resolution in ('fixed', 'hidden', 'dismissed')),
  reported_at         timestamptz not null default now(),
  resolved_at         timestamptz
);

comment on table reports is '通報者への結果通知は行わない（要件定義書7.11.3）。通知先を持たせない';

create table post_quotas (
  account_id          uuid not null references accounts(account_id),
  year_month          text not null,  -- 'YYYY-MM'
  used                int not null default 0,
  returned            int not null default 0,  -- 却下による返却。月2回まで（制約#6）
  primary key (account_id, year_month),
  constraint chk_post_quotas_returned_max check (returned <= 2)
);
