-- 1) 四半期レポートに、機能3（動画）の視聴数を追加する（要件 7.6.3）
-- 2) 退会のときに、機能1・通知設定のデータも片づける（要件 9.3・10.3.3）。視聴ログは、識別情報を消したアカウントに紐づくだけなので残す
--    【注意】破棄の回数（投稿機能の停止の判断）は、退会したアカウントには不要になるため、紐付けごと消す

alter table client_quarterly_reports add column video_views int;

create or replace function system_generate_quarterly_reports(p_quarter_start date default null, p_client_id uuid default null)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_start date := coalesce(p_quarter_start, (date_trunc('quarter', v_today) - interval '3 months')::date);
  v_from timestamptz;
  v_to timestamptz;
  v_min_total int := setting_int('report_min_total', 10);
  v_min_genre int := setting_int('report_min_genre', 5);
  v_small int := setting_int('small_client_members', 30);
  v_client record;
  v_total int;
  v_members int;
  v_genres jsonb;
  v_sla int;
  v_videos int;
  v_masked boolean;
  v_count int := 0;
begin
  if v_start <> date_trunc('quarter', v_start)::date then
    raise exception 'invalid_quarter' using errcode = '22023';
  end if;
  -- まだ終わっていない四半期は作らない（期中の値を出さない）
  if (v_start + interval '3 months')::date > v_today then
    raise exception 'quarter_not_finished' using errcode = '22023';
  end if;
  v_from := (v_start::text || ' 00:00:00+09')::timestamptz;
  v_to := ((v_start + interval '3 months')::date::text || ' 00:00:00+09')::timestamptz;

  for v_client in
    select client_id, contract_type, employee_count, feature_consult
    from clients
    where status <> 'prep' and (p_client_id is null or client_id = p_client_id)
  loop
    select count(*) into v_members from accounts a where a.client_id = v_client.client_id and a.deleted_at is null;
    select count(*) into v_total from cases c where c.client_id = v_client.client_id and c.opened_at >= v_from and c.opened_at < v_to;

    -- ジャンル別（共通設問「ご相談したい内容に近いもの」の回答）
    select coalesce(jsonb_agg(jsonb_build_object('label', g.label, 'count', g.n) order by g.n desc, g.label), '[]'::jsonb)
    into v_genres
    from (
      select a.option_label_snapshot as label, count(*)::int as n
      from cases c
      join case_survey_answers a on a.case_id = c.case_id
      where c.client_id = v_client.client_id and c.opened_at >= v_from and c.opened_at < v_to
        and a.survey_question_id = '5e000000-0000-4000-8000-0000000000b2'
      group by a.option_label_snapshot
    ) g;

    -- SLA遵守率：最初の相談者メッセージから最初の返信までが、案件に複写された SLA 時間以内だった割合（暦時間）
    select case when count(*) = 0 then null else round(100.0 * count(*) filter (where x.hours <= x.sla) / count(*))::int end
    into v_sla
    from (
      select e.sla_hours as sla,
             extract(epoch from (
               (select min(m.sent_at) from messages m where m.case_id = c.case_id and m.sender = 'counselor')
               - (select min(m.sent_at) from messages m where m.case_id = c.case_id and m.sender = 'user')
             )) / 3600.0 as hours
      from cases c
      join entitlements e on e.entitlement_id = c.entitlement_id
      where c.client_id = v_client.client_id and c.opened_at >= v_from and c.opened_at < v_to
    ) x
    where x.hours is not null;

    -- 機能3の視聴数（クライアント全体。個人別には出さない：要件 7.6.3）。相談に関する数値ではないため、小規模クライアントにも出す
    select count(*) into v_videos
    from video_views vv join accounts a on a.account_id = vv.account_id
    where a.client_id = v_client.client_id and vv.viewed_at >= v_from and vv.viewed_at < v_to;

    if v_client.contract_type = 'corp' then
      v_masked := not v_client.feature_consult
                  or (v_client.employee_count is not null and v_client.employee_count < v_small);
      if v_masked then
        -- 小規模クライアント・相談機能が無効のクライアントには、相談に関する数値を出さない
        v_total := null; v_genres := null; v_sla := null;
      elsif v_total < v_min_total then
        v_genres := null;
      else
        -- 一定数未満のジャンルは「その他」に合算する
        select coalesce(jsonb_agg(jsonb_build_object('label', s.label, 'count', s.n) order by s.ord, s.n desc), '[]'::jsonb)
        into v_genres
        from (
          select (e ->> 'label') as label, (e ->> 'count')::int as n, 0 as ord
          from jsonb_array_elements(v_genres) e
          where (e ->> 'count')::int >= v_min_genre and (e ->> 'label') <> 'その他'
          union all
          select 'その他', coalesce(sum((e ->> 'count')::int), 0)::int, 1
          from jsonb_array_elements(v_genres) e
          where (e ->> 'count')::int < v_min_genre or (e ->> 'label') = 'その他'
          having coalesce(sum((e ->> 'count')::int), 0) > 0
        ) s;
      end if;
    end if;

    insert into client_quarterly_reports (client_id, quarter_start, members, employee_count, cases_total, genres, sla_rate, video_views, generated_at)
    values (v_client.client_id, v_start, v_members, v_client.employee_count, v_total, v_genres, v_sla, v_videos, now())
    on conflict (client_id, quarter_start) do update
      set members = excluded.members, employee_count = excluded.employee_count, cases_total = excluded.cases_total,
          genres = excluded.genres, sla_rate = excluded.sla_rate, video_views = excluded.video_views, generated_at = excluded.generated_at;
    v_count := v_count + 1;
  end loop;

  insert into audit_logs (actor_type, action, target_type, reason)
  values ('system', 'report.generate', 'client_quarterly_reports', format('%s 開始の四半期／%s 件', v_start, v_count));
  return v_count;
end;
$$;


create or replace function user_withdraw(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purge timestamptz := now() + make_interval(days => setting_int('deletion_grace_days', 30));
  v_cases int := 0;
  v_case record;
begin
  perform 1 from accounts where account_id = p_account_id and deleted_at is null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- 運営側のアカウントは対象外（相談員の登録まで壊してしまうため）
  if exists (select 1 from counselors where counselor_id = p_account_id) then
    raise exception 'staff_account' using errcode = '22023';
  end if;

  update cases
  set status = 'closed', close_reason = 'manual', closed_at = now(), awaiting_reply_since = null
  where account_id = p_account_id and status = 'open';

  for v_case in
    select c.case_id from cases c
    where c.account_id = p_account_id
      and not exists (select 1 from deletion_requests d where d.target_type = 'case' and d.target_id = c.case_id)
  loop
    update messages set hidden_at = now(), purge_after = v_purge where case_id = v_case.case_id and hidden_at is null;
    insert into deletion_requests (account_id, target_type, target_id, purge_after)
    values (p_account_id, 'case', v_case.case_id, v_purge);
    v_cases := v_cases + 1;
  end loop;

  -- 機能1：公開済みの投稿は、本人との紐付けだけを消す（本体は残す：要件 9.3 の特則）。公開されていない投稿は本文を消す
  update questions set account_id = null where account_id = p_account_id and status = 'published';
  update questions set body = '（削除済み）', hidden_at = coalesce(hidden_at, now()), account_id = null
  where account_id = p_account_id and status <> 'published';
  update reports set reporter_account_id = null where reporter_account_id = p_account_id;
  delete from qa_full_reads where account_id = p_account_id;
  delete from notification_settings where account_id = p_account_id;

  delete from account_attributes where account_id = p_account_id;
  update accounts
  set deleted_at = now(), email = null, client_id = null, tier = 'free'
  where account_id = p_account_id;

  -- Auth 側の識別情報を消し、ログインできないようにする
  update auth.users
  set email = 'deleted-' || id::text || '@deleted.dialcom-op-dev.vercel.app',
      encrypted_password = null,
      raw_user_meta_data = '{}'::jsonb,
      banned_until = '2999-01-01T00:00:00Z'::timestamptz,
      email_change = '',
      phone = null
  where id = p_account_id;
  delete from auth.sessions where user_id = p_account_id;
  delete from auth.identities where user_id = p_account_id;

  return jsonb_build_object('withdrawn', true, 'cases', v_cases);
end;
$$;
