-- データモデル設計.md 第5章：機能3（動画）

create table videos (
  video_id            uuid primary key default gen_random_uuid(),
  title               text not null,
  category            text,
  source_ref          text,  -- 外部サービスの動画ID
  duration_sec         int,
  scope_personal      text not null default 'none' check (scope_personal in ('free', 'paid', 'none')),
  scope_business       text not null default 'none' check (scope_business in ('all', 'some', 'none')),
  status              text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  published_at        timestamptz,
  updated_at          timestamptz,

  -- 制約#3：scope_personal と scope_business がともに none の状態で status='published' にできない
  constraint chk_videos_scope_before_publish
    check (not (status = 'published' and scope_personal = 'none' and scope_business = 'none'))
);

create table video_client_scopes (
  video_id            uuid not null references videos(video_id),
  client_id           uuid not null references clients(client_id),
  primary key (video_id, client_id)
);

comment on table video_client_scopes is 'scope_business = ''some'' の場合にのみ行を持つ';

create table video_views (
  view_id             uuid primary key default gen_random_uuid(),
  video_id            uuid not null references videos(video_id),
  account_id          uuid not null references accounts(account_id),
  viewed_at           timestamptz not null default now()
);

comment on table video_views is '個人単位でクライアントへ開示しない（4.4）。集計値のみ四半期レポートに含める';
