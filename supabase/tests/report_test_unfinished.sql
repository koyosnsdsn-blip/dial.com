-- 四半期レポート：テスト用クライアントだけ、期中の四半期も作れる（2026-10-15）
--   R1 従来の入口（system_generate_quarterly_reports）は、期中の四半期を作れない（cron と同じ挙動）
--   R2 テスト用クライアントを指定し p_allow_unfinished = true なら、期中の四半期の行ができ、件数は集計と一致する
--   R3 通常のクライアントには、p_allow_unfinished = true でも作れない（0件）
--   R4 クライアントを指定しない（全体）なら、p_allow_unfinished = true でも期中は作れない
--   R5 終わった四半期は、従来の入口とコア関数で同じ結果になる
-- 最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  cl_t uuid := gen_random_uuid(); cl_n uuid := gen_random_uuid();
  q_now date := date_trunc('quarter', (now() at time zone 'Asia/Tokyo'))::date;
  q_prev date := (date_trunc('quarter', (now() at time zone 'Asia/Tokyo')) - interval '3 months')::date;
  n int; failed boolean; failures text := ''; r1 record; r2 record;
begin
  insert into clients (client_id, name, contract_type, status, feature_consult, rally_max, sla_hours, is_test, employee_count) values
    (cl_t, 'Rテスト', 'corp', 'active', true, 2, 12, true, 100),
    (cl_n, 'R通常',   'corp', 'active', true, 2, 12, false, 100);

  -- R1
  failed := false;
  begin perform system_generate_quarterly_reports(q_now, cl_t); exception when sqlstate '22023' then failed := true; end;
  if not failed then failures := failures || 'R1 従来の入口が期中を作れた; '; end if;

  -- R2
  n := system_generate_quarterly_reports_core(q_now, cl_t, true);
  if n <> 1 then failures := failures || format('R2 件数が違う（%s）; ', n); end if;
  if not exists (select 1 from client_quarterly_reports where client_id = cl_t and quarter_start = q_now) then failures := failures || 'R2 行ができていない; '; end if;

  -- R3
  n := system_generate_quarterly_reports_core(q_now, cl_n, true);
  if n <> 0 then failures := failures || format('R3 通常のクライアントに作れた（%s）; ', n); end if;
  if exists (select 1 from client_quarterly_reports where client_id = cl_n and quarter_start = q_now) then failures := failures || 'R3 通常のクライアントの行ができた; '; end if;

  -- R4
  failed := false;
  begin perform system_generate_quarterly_reports_core(q_now, null, true); exception when sqlstate '22023' then failed := true; end;
  if not failed then failures := failures || 'R4 全体で期中が作れた; '; end if;

  -- R5
  perform system_generate_quarterly_reports(q_prev, cl_t);
  select members, cases_total, genres, sla_rate, video_views into r1 from client_quarterly_reports where client_id = cl_t and quarter_start = q_prev;
  perform system_generate_quarterly_reports_core(q_prev, cl_t, true);
  select members, cases_total, genres, sla_rate, video_views into r2 from client_quarterly_reports where client_id = cl_t and quarter_start = q_prev;
  if r1 is distinct from r2 then failures := failures || 'R5 終わった四半期の結果が一致しない; '; end if;

  if failures <> '' then raise exception 'report_test_unfinished FAILED: %', failures; end if;
  raise exception 'report_test_unfinished PASSED（テストデータは取り消されます）';
end $$;
