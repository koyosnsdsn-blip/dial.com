-- クライアント管理サイト（要件 7.6）のための、事前集計済みの四半期レポート
--
-- CLAUDE.md 制約#3：クライアント管理者（client_admins）には、相談内容系テーブルへの経路を持たせず、
-- 事前集計済みのデータだけを見せる。このテーブルがその「事前集計済みのデータ」にあたる。
--   - 値は、開示してよい形に加工したものだけを保存する（加工前の値は保存しない）
--   - クライアント管理者は、自分のクライアントの行だけを、多要素認証を通過したセッションで読める（RLS）
--   - 更新は四半期ごと。任意の期間での集計や、日次・月次の更新は行わない（差分から相談の時期を推定されないため：7.6.3）
--
-- 企業契約型に適用する開示の制限（要件 3.10.2・7.6.3・7.6.4）
--   - 総件数が一定数（既定10件）未満なら、件数のみを出し、内訳は出さない
--   - ジャンル別の内訳は、一定数（既定5件）以上のジャンルだけを出し、それ未満は「その他」に合算する
--   - 契約上の従業員数が一定数未満のクライアントには、相談に関する数値を出さない
-- 自治体委託型には、これらの制限を適用しない（3.12.8）
-- 【仮】閾値は system_settings（report_min_total / report_min_genre / small_client_members）。既定は 10 / 5 / 30

create table client_quarterly_reports (
  client_id       uuid not null references clients(client_id),
  quarter_start   date not null,            -- 四半期の初日（日本時間）
  members         int not null,             -- 登録件数（作成時点で所属が付いているアカウントの数）
  employee_count  int,                      -- 契約上の従業員数（作成時点）
  cases_total     int,                      -- 期間内の相談件数。NULL は「提供しない」
  genres          jsonb,                    -- [{"label": "...", "count": n}]。NULL は「内訳を提供しない」
  sla_rate        int,                      -- SLA遵守率（%）。NULL は「提供しない」または対象なし
  generated_at    timestamptz not null default now(),
  primary key (client_id, quarter_start)
);

comment on table client_quarterly_reports is 'クライアント管理サイト向けの四半期レポート。開示してよい形に加工した値だけを保存する';

alter table client_quarterly_reports enable row level security;

create policy client_reports_select_own_client
  on client_quarterly_reports for select
  to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from client_admins ca
      where ca.admin_id = auth.uid()
        and ca.client_id = client_quarterly_reports.client_id
        and ca.status = 'active'
    )
  );

grant select on client_quarterly_reports to authenticated;

-- 四半期レポートの作成。p_quarter_start を省略すると、直前の四半期（日本時間）を作る。
-- 同じ四半期をもう一度作ると上書きする（運営管理者による作り直し用）。
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

    insert into client_quarterly_reports (client_id, quarter_start, members, employee_count, cases_total, genres, sla_rate, generated_at)
    values (v_client.client_id, v_start, v_members, v_client.employee_count, v_total, v_genres, v_sla, now())
    on conflict (client_id, quarter_start) do update
      set members = excluded.members, employee_count = excluded.employee_count, cases_total = excluded.cases_total,
          genres = excluded.genres, sla_rate = excluded.sla_rate, generated_at = excluded.generated_at;
    v_count := v_count + 1;
  end loop;

  insert into audit_logs (actor_type, action, target_type, reason)
  values ('system', 'report.generate', 'client_quarterly_reports', format('%s 開始の四半期／%s 件', v_start, v_count));
  return v_count;
end;
$$;

revoke execute on function system_generate_quarterly_reports(date, uuid) from public, anon, authenticated;
grant execute on function system_generate_quarterly_reports(date, uuid) to service_role;

-- 四半期の初日（日本時間 0:10 ごろ）に、直前の四半期のレポートを作る。UTC では前日 15:10
select cron.schedule('quarterly-reports', '10 15 31 3,12 *', $cron$select public.system_generate_quarterly_reports()$cron$);
select cron.schedule('quarterly-reports-30', '10 15 30 6,9 *', $cron$select public.system_generate_quarterly_reports()$cron$);
