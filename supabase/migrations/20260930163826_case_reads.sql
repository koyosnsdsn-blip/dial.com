-- 相談員からの返信が「未読」かどうかを、利用者に示すための既読記録。
--
-- 背景：利用者の登録はニックネームとパスワードのみで、メールアドレスを持たない（未決事項一覧 2.12）。
--   返信が来たことをメールで知らせられないため、ログインしたときに「お返事が届いています」と画面で示す。
--
-- cases に列を足さず別テーブルにする理由：cases は Realtime の配信対象で、利用者が画面を開くたびに更新すると、
--   そのつど相談員側のダッシュボードに変更通知が飛んでしまうため。
-- 書き込みは相談者側アプリのサーバールート（service_role）のみ。ブラウザには権限を与えない。

create table case_reads (
  case_id          uuid primary key references cases(case_id) on delete cascade,
  account_read_at  timestamptz not null default now()
);

comment on table case_reads is '利用者が案件のやり取りを最後に開いた時刻。未読の返信の有無の判定に使う';

alter table case_reads enable row level security;
-- ポリシーは作らない（anon / authenticated からは全拒否）。service_role は既定権限で読み書きできる

-- 利用者本人向けのビューに「未読の返信があるか」を追加する（列の追加は末尾のみ）
create or replace view my_cases
with (security_invoker = false)
as
select
  c.case_id,
  c.status,
  c.close_reason,
  c.opened_at,
  c.closed_at,
  c.client_id,
  case
    when c.counselor_id is null or p.prev_counselor_id is null then null
    when c.counselor_id = p.prev_counselor_id then 'same'
    else 'changed'
  end as continuity,
  exists (
    select 1
    from messages m
    where m.case_id = c.case_id
      and m.sender = 'counselor'
      and m.hidden_at is null
      and m.sent_at > coalesce((select r.account_read_at from case_reads r where r.case_id = c.case_id), '-infinity'::timestamptz)
  ) as has_unread
from cases c
left join lateral (
  select k.counselor_id as prev_counselor_id
  from cases k
  where k.account_id = c.account_id and k.opened_at < c.opened_at
  order by k.opened_at desc
  limit 1
) p on true
where c.account_id = auth.uid();

revoke all on my_cases from public, anon, authenticated;
grant select on my_cases to authenticated;
grant select on my_cases to service_role;
