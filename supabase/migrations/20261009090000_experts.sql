-- 先生コメント（公開Q&A）の土台（2026-10-09 ダイヤルさんの構想。docs/未決事項一覧_統合版.md 2.19）
--
--   experts          … 先生（弁護士・社労士・メンタル相談の先生など）。Supabase Auth（auth.users）に登録する
--   expert_genres    … 先生の担当ジャンル（多対多）。担当ジャンルの質問にだけコメントできる
--   expert_comments  … 先生のコメント。下書き→確認待ち→（差し戻し）→公開→非表示。公開は相談員の確認後
--
-- 先生は counselors に入れない。理由：is_active_counselor() は role を見ず「counselors に存在し active」だけで判定するため、
--   先生を相談員の表に入れると、cases・messages などの相談内容系のRLSを通ってしまう。別テーブルなら、先生が通れる範囲は
--   このファイルで定めたものだけになる（CLAUDE.md 制約#1〜#3）。
--
-- 先生に見せる質問は「公開済み（匿名化済み）で、担当ジャンルのもの」だけ。公開前の投稿は見せない。
--   questions を直接読ませず、account_id を含まない関数 expert_visible_questions() だけを通す。
-- 書き込みはブラウザから行わない（サーバールート経由）。DBの規則（誰がどの質問にコメントできるか、状態の移り方、
--   公開後に本文を変えない）は、サーバー側の判定に加えてトリガでも守る（service_role もトリガは迂回できない）。
-- 先生を退任させるときは削除せず status = 'suspended' にする（公開済みコメントの出所を残すため。コメントがある先生は削除できない）。

-- ---------- テーブル ----------

create table experts (
  expert_id      uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null check (length(display_name) between 1 and 50),     -- 利用者に表示する名前
  qualification  text not null check (length(qualification) between 1 and 50),    -- 表示用の資格・肩書（例：臨床心理士、弁護士）
  affiliation    text check (affiliation is null or length(affiliation) <= 100),  -- 所属（事務所名など）
  bio            text check (bio is null or length(bio) <= 1000),                 -- 紹介文
  status         text not null default 'active' check (status in ('active', 'suspended')),
  created_at     timestamptz not null default now()
);

create table expert_genres (
  expert_id  uuid not null references experts(expert_id) on delete cascade,
  genre_id   uuid not null references genres(genre_id),
  primary key (expert_id, genre_id)
);

create table expert_comments (
  comment_id    uuid primary key default gen_random_uuid(),
  question_id   uuid not null references questions(question_id) on delete cascade,
  expert_id     uuid not null references experts(expert_id),
  body          text not null check (length(body) between 1 and 5000),
  status        text not null default 'draft'
                  check (status in ('draft', 'pending', 'returned', 'published', 'hidden')),
  review_note   text check (review_note is null or length(review_note) <= 1000),  -- 差し戻しの理由（先生に見せる）
  reviewed_by   uuid references counselors(counselor_id),
  created_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  published_at  timestamptz,
  hidden_at     timestamptz,
  unique (question_id, expert_id)   -- 1つの質問に、1人の先生がつけられるコメントは1件
);

create index ix_expert_comments_review on expert_comments (submitted_at) where status = 'pending';
create index ix_expert_comments_question on expert_comments (question_id) where status = 'published';
create index ix_expert_genres_genre on expert_genres (genre_id);

comment on table experts is '先生。counselors とは別の表（is_active_counselor() を通さないため）。退任は削除せず suspended にする';
comment on table expert_comments is '先生コメント。本文は下書き・差し戻しの間だけ変更できる（確認した本文がそのまま公開される）';

-- ---------- 判定用の関数 ----------

-- 先生本人か。相談員と同じく、2段階認証を通過したセッション（aal2）だけを有効とする（仮：docs 2.19）
create or replace function is_active_expert()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from experts
       where expert_id = auth.uid() and status = 'active'
     );
$$;

-- 先生が見られる質問：公開済み・削除されていない・担当ジャンル。account_id は返さない
create or replace function expert_visible_questions()
returns table (question_id uuid, display_id text, genre_id uuid, body text, published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select q.question_id, q.display_id, q.genre_id, q.body, q.published_at
  from questions q
  where is_active_expert()
    and q.status = 'published'
    and q.hidden_at is null
    and q.genre_id in (select eg.genre_id from expert_genres eg where eg.expert_id = auth.uid());
$$;

revoke execute on function is_active_expert() from public, anon;
revoke execute on function expert_visible_questions() from public, anon;
grant execute on function is_active_expert() to authenticated;
grant execute on function expert_visible_questions() to authenticated;

-- ---------- RLS と権限 ----------

alter table experts         enable row level security;
alter table expert_genres   enable row level security;
alter table expert_comments enable row level security;

revoke all on experts, expert_genres, expert_comments from anon, authenticated;
grant select on experts, expert_genres, expert_comments to authenticated;
grant all on experts, expert_genres, expert_comments to service_role;

-- 先生本人は自分の行だけ、相談員は全件（コメントの確認・先生の管理のため）
create policy experts_select_self_or_staff
  on experts for select to authenticated
  using (expert_id = auth.uid() or is_active_counselor());

create policy expert_genres_select_self_or_staff
  on expert_genres for select to authenticated
  using ((expert_id = auth.uid() and is_active_expert()) or is_active_counselor());

create policy expert_comments_select_self_or_staff
  on expert_comments for select to authenticated
  using ((expert_id = auth.uid() and is_active_expert()) or is_active_counselor());

-- 相談員は2段階認証を通過したセッションでのみ読める（staff_require_mfa と同じ規則）
create policy experts_staff_require_mfa
  on experts as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));

create policy expert_genres_staff_require_mfa
  on expert_genres as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));

create policy expert_comments_staff_require_mfa
  on expert_comments as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not (select is_active_counselor()));

-- ---------- 監査ログの操作者に「先生」を加える ----------

alter table audit_logs drop constraint audit_logs_actor_type_check;
alter table audit_logs add constraint audit_logs_actor_type_check
  check (actor_type in ('counselor', 'client_admin', 'account', 'system', 'expert'));

-- ---------- トリガ ----------

-- 先生のIDは、相談員・利用者・クライアント管理者と重ならない（別の役割は別のアカウントにする：docs 2.14）
create or replace function guard_expert_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from counselors where counselor_id = new.expert_id)
     or exists (select 1 from accounts where account_id = new.expert_id)
     or exists (select 1 from client_admins where admin_id = new.expert_id) then
    raise exception 'expert_identity_conflict' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_experts_identity
  before insert on experts
  for each row execute function guard_expert_identity();

-- コメントの規則
--   ・作れるのは、公開済み・削除されていない質問で、先生が有効かつ担当ジャンルのとき
--   ・状態の移り方：下書き→確認待ち／差し戻し→確認待ち／確認待ち→公開・差し戻し／公開↔非表示
--   ・本文を変えられるのは、下書きと差し戻しの間だけ（確認した本文が、そのまま公開される）
--   ・公開・差し戻しには確認した相談員（reviewed_by）が必要。時刻はこのトリガが記録する
create or replace function guard_expert_comment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  q record;
  into_pending boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending') then
      raise exception 'invalid_status' using errcode = 'P0001';
    end if;
    into_pending := (new.status = 'pending');
  else
    if new.question_id <> old.question_id or new.expert_id <> old.expert_id then
      raise exception 'immutable_key' using errcode = 'P0001';
    end if;
    if new.body is distinct from old.body and old.status not in ('draft', 'returned') then
      raise exception 'body_locked' using errcode = 'P0001';
    end if;
    if new.status <> old.status
       and (old.status, new.status) not in (
         ('draft', 'pending'), ('returned', 'pending'),
         ('pending', 'published'), ('pending', 'returned'),
         ('published', 'hidden'), ('hidden', 'published')
       ) then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    into_pending := (new.status = 'pending' and old.status <> 'pending');
  end if;

  -- 作成時、確認待ちにするとき、公開するときは、質問と先生の状態を確かめる
  if tg_op = 'INSERT' or into_pending or (new.status = 'published' and old.status is distinct from 'published') then
    select status, hidden_at, genre_id into q from questions where question_id = new.question_id;
    if not found or q.status <> 'published' or q.hidden_at is not null then
      raise exception 'question_not_open' using errcode = 'P0001';
    end if;
    if not exists (select 1 from experts where expert_id = new.expert_id and status = 'active') then
      raise exception 'expert_inactive' using errcode = 'P0001';
    end if;
    if (tg_op = 'INSERT' or into_pending)
       and not exists (select 1 from expert_genres where expert_id = new.expert_id and genre_id = q.genre_id) then
      raise exception 'genre_not_assigned' using errcode = 'P0001';
    end if;
  end if;

  if new.status in ('published', 'returned') and tg_op = 'UPDATE' and new.status <> old.status
     and new.reviewed_by is null then
    raise exception 'reviewer_required' using errcode = 'P0001';
  end if;

  if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending') then
    new.submitted_at := now();
    new.review_note := null;
    new.reviewed_by := null;   -- 前回の確認者を残さない（再提出のたびに、改めて確認した相談員が必要）
  end if;
  if new.status = 'published' and tg_op = 'UPDATE' then
    if old.status = 'pending' then new.published_at := now(); end if;
    if old.status = 'hidden' then new.hidden_at := null; end if;
  end if;
  if new.status = 'hidden' and tg_op = 'UPDATE' and old.status <> 'hidden' then
    new.hidden_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_expert_comments_guard
  before insert or update on expert_comments
  for each row execute function guard_expert_comment();

-- 質問が削除された（本人による削除・退会・運営による削除）ときは、先生コメントも消す
create or replace function purge_expert_comments_of_hidden_question()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.hidden_at is not null and old.hidden_at is null then
    delete from expert_comments where question_id = new.question_id;
  end if;
  return null;
end;
$$;

create trigger trg_questions_purge_expert_comments
  after update on questions
  for each row execute function purge_expert_comments_of_hidden_question();

revoke execute on function guard_expert_identity() from public, anon, authenticated;
revoke execute on function guard_expert_comment() from public, anon, authenticated;
revoke execute on function purge_expert_comments_of_hidden_question() from public, anon, authenticated;
