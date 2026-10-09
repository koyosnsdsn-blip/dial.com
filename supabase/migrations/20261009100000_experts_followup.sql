-- 先生の連絡先メールアドレス（2026-10-09。docs/未決事項一覧_統合版.md 2.19）
-- 先生は /ops から、相談員と同じ作りでログインする。Auth に登録する識別子は x-…@内部ドメイン（メールアドレスから生成）で、
-- 本物のメールアドレスはここ（contact_email）に持つ（counselors.contact_email と同じ考え方）。

alter table public.experts add column if not exists contact_email text
  check (contact_email is null or length(contact_email) <= 254);

create unique index if not exists experts_contact_email_key
  on public.experts (lower(contact_email))
  where contact_email is not null;

comment on column public.experts.contact_email is '連絡先のメールアドレス（本物）。ログインには使わない。Auth 上のアドレスは x-…@内部ドメイン の識別子';

-- 一時非公開（通報の集中など。questions.unpublished_at）の質問は、先生にも見せず、コメントも受け付けない。
-- 公開の判定（qa_is_public）と同じ条件にそろえる。
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
    and q.unpublished_at is null
    and q.hidden_at is null
    and q.genre_id in (select eg.genre_id from expert_genres eg where eg.expert_id = auth.uid());
$$;

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
    select status, hidden_at, unpublished_at, genre_id into q from questions where question_id = new.question_id;
    if not found or q.status <> 'published' or q.hidden_at is not null or q.unpublished_at is not null then
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
  if new.status = 'hidden' and tg_op = 'UPDATE' and new.status <> old.status then
    new.hidden_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function guard_expert_comment() from public, anon, authenticated;
