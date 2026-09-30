-- 相談の終了と削除に関する処理
--   1) 企業枠の無操作による自動クローズ（要件 3.2.6）と、その予告のための列
--   2) 利用者による相談内容の削除（要件 9.3）：削除操作で即時に非表示にし、猶予期間の経過後に物理削除する
--
-- 【仮の値】期間はいずれも未決のため、system_settings に値がなければ次の既定値を使う。
--   idle_close_days（無操作クローズまでの日数。未決事項 No.61）      … 14日
--   deletion_grace_days（削除の猶予期間。未決事項 No.9）              … 30日
-- system_settings に行を入れれば、コードを変えずに変更できる。

-- 設定値（整数）の取得。未設定・数値でない場合は既定値
create or replace function setting_int(p_key text, p_default int)
returns int
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select case when s.setting_value ~ '^[0-9]{1,6}$' then s.setting_value::int end
     from system_settings s where s.setting_key = p_key),
    p_default
  );
$$;

-- ============================================================
-- 1) 無操作による自動クローズ
--    対象：企業枠（利用権の付与元が client）の対応中の案件で、最後の送信から一定期間やり取りがないもの。
--    【仮】相談者が送信して相談員の返信を待っている案件（awaiting_reply_since がある）は対象にしない。
--      要件は「利用者・相談員のいずれかの送信のたびに起算し直す」だが、返信を待たせている側の都合で
--      相談者の案件を閉じることになるため。返信の遅れは SLA の問題として別に扱う。
-- ============================================================

create or replace function system_close_idle_cases()
returns int
language plpgsql
set search_path = public
as $$
declare
  v_days int := setting_int('idle_close_days', 14);
  v_count int := 0;
  v_case record;
begin
  for v_case in
    select c.case_id
    from cases c
    join entitlements e on e.entitlement_id = c.entitlement_id
    where c.status = 'open'
      and e.source = 'client'
      and c.awaiting_reply_since is null
      and c.last_activity_at < now() - make_interval(days => v_days)
    for update of c skip locked
  loop
    update cases
    set status = 'closed', close_reason = 'idle', closed_at = now()
    where case_id = v_case.case_id;

    insert into audit_logs (actor_type, action, target_type, target_id, reason)
    values ('system', 'case.close.idle', 'cases', v_case.case_id, format('無操作 %s 日', v_days));

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function setting_int(text, int) from public, anon, authenticated;
revoke execute on function system_close_idle_cases() from public, anon, authenticated;
grant execute on function setting_int(text, int) to service_role;
grant execute on function system_close_idle_cases() to service_role;

-- 1時間ごとに実行する（技術基盤設計書 7章：DB内で完結する定期処理は pg_cron）
create extension if not exists pg_cron;
select cron.schedule('close-idle-cases', '17 * * * *', $cron$select public.system_close_idle_cases()$cron$);

-- ============================================================
-- 2) 利用者による相談内容の削除
--    - 終了した案件だけ削除できる（対応中の案件は、先に終了している必要がある）
--    - 削除操作の時点でメッセージを非表示にし（hidden_at）、物理削除の予定日時（purge_after）を入れる
--    - deletion_requests に記録する。以後、本人の一覧（my_cases）には出さない
--    - 物理削除の実行（猶予期間の経過後）は、猶予期間が未決のため、まだ自動実行していない
-- ============================================================

create or replace function user_delete_case(p_account_id uuid, p_case_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_case cases%rowtype;
  v_purge timestamptz := now() + make_interval(days => setting_int('deletion_grace_days', 30));
begin
  select * into v_case from cases where case_id = p_case_id for update;
  if not found or v_case.account_id <> p_account_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from deletion_requests d where d.target_type = 'case' and d.target_id = p_case_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_case.status <> 'closed' then
    raise exception 'case_open' using errcode = '22023';
  end if;

  update messages
  set hidden_at = now(), purge_after = v_purge
  where case_id = p_case_id and hidden_at is null;

  insert into deletion_requests (account_id, target_type, target_id, purge_after)
  values (p_account_id, 'case', p_case_id, v_purge);

  return jsonb_build_object('deleted', true, 'purge_after', v_purge);
end;
$$;

revoke execute on function user_delete_case(uuid, uuid) from public, anon, authenticated;
grant execute on function user_delete_case(uuid, uuid) to service_role;

create index if not exists idx_deletion_requests_target on deletion_requests (target_type, target_id);

-- ============================================================
-- 利用者本人向けのビュー：削除した案件を出さない。自動クローズの予定日時を追加する（列の追加は末尾のみ）
-- ============================================================

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
  ) as has_unread,
  -- このままやり取りがない場合に自動で終了する日時（対象外の案件は NULL）。予告の表示に使う
  case
    when c.status = 'open' and c.awaiting_reply_since is null
         and exists (select 1 from entitlements e where e.entitlement_id = c.entitlement_id and e.source = 'client')
    -- 設定値はビューの中で直接読む（ビューから呼ぶ関数は利用者の権限で実行されるため、setting_int は使わない）
    then c.last_activity_at + make_interval(days => coalesce(
      (select case when s.setting_value ~ '^[0-9]{1,6}$' then s.setting_value::int end
       from system_settings s where s.setting_key = 'idle_close_days'),
      14))
  end as idle_close_at
from cases c
left join lateral (
  select k.counselor_id as prev_counselor_id
  from cases k
  where k.account_id = c.account_id and k.opened_at < c.opened_at
  order by k.opened_at desc
  limit 1
) p on true
where c.account_id = auth.uid()
  and not exists (
    select 1 from deletion_requests d
    where d.target_type = 'case' and d.target_id = c.case_id
  );

revoke all on my_cases from public, anon, authenticated;
grant select on my_cases to authenticated;
grant select on my_cases to service_role;
