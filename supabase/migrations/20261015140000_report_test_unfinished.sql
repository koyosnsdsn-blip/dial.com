-- 四半期レポート：テスト用クライアントに限り、期中の四半期も任意に作れるようにする（2026-10-15 ダイヤルさんの指示）
--   集計の中身は自動生成（pg_cron）と同一にするため、本体を system_generate_quarterly_reports_core に移し、
--   従来の system_generate_quarterly_reports(date, uuid) は「終わった四半期だけ」を作る薄い入口として残す（cron の呼び出しは変えない）。
--   期中の四半期を作れるのは、クライアントを1件指定し、そのクライアントが is_test のときだけ（本番のクライアントには作れない）。
--   期中に作った行は、四半期が終わったあとの自動生成で、同じ行が上書きされる（on conflict do update）。

create or replace function system_generate_quarterly_reports_core(p_quarter_start date, p_client_id uuid, p_allow_unfinished boolean)
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
  v_unfinished boolean;
begin
  if v_start <> date_trunc('quarter', v_start)::date then
    raise exception 'invalid_quarter' using errcode = '22023';
  end if;
  -- まだ終わっていない四半期は作らない（期中の値を出さない）。
  -- 例外：テスト用のクライアント1件を指定し、p_allow_unfinished を true にしたときだけ、期中の四半期も作れる（動作確認用。集計の中身は同じ）
  v_unfinished := (v_start + interval '3 months')::date > v_today;
  if v_unfinished and not (p_allow_unfinished and p_client_id is not null) then
    raise exception 'quarter_not_finished' using errcode = '22023';
  end if;
  v_from := (v_start::text || ' 00:00:00+09')::timestamptz;
  v_to := ((v_start + interval '3 months')::date::text || ' 00:00:00+09')::timestamptz;

  for v_client in
    select client_id, contract_type, employee_count, feature_consult
    from clients
    where status <> 'prep' and (p_client_id is null or client_id = p_client_id)
      and (not v_unfinished or is_test)
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
  values ('system', 'report.generate', 'client_quarterly_reports', format('%s 開始の四半期／%s 件%s', v_start, v_count, case when v_unfinished then '（期中・テスト用クライアント）' else '' end));
  return v_count;
end;
$$;

revoke execute on function system_generate_quarterly_reports_core(date, uuid, boolean) from public, anon, authenticated;
grant execute on function system_generate_quarterly_reports_core(date, uuid, boolean) to service_role;

create or replace function system_generate_quarterly_reports(p_quarter_start date default null, p_client_id uuid default null)
returns int
language sql
set search_path = public
as $$
  select system_generate_quarterly_reports_core(p_quarter_start, p_client_id, false);
$$;
