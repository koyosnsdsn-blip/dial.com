-- ニックネームで登録した利用者は、招待コードなしで相談を始められるようにする（2026-10-01 入江さんの指示）
--
-- 【仮の前提】
--   - 費用はかからない（決済が未実装のため）。利用権は「無償の付与」として記録する（entitlements.granted_free = true）
--   - 往復の回数は、個人の標準の5回（system_settings の personal_rally_max）。返信の目安は24時間で固定
--   - 有効期間は設けない。代わりに、企業枠と同じ「しばらくやり取りがないと自動で終了」を適用する
--   - 誰が対象かは、サーバールートが判定して p_personal_free で渡す（ニックネームで登録した、所属のない利用者）
--   - 同時に進められる相談は1件まで（これまでと同じ）

drop function user_start_case(uuid, jsonb, boolean);

create function user_start_case(p_account_id uuid, p_answers jsonb, p_muni_consent boolean default false, p_personal_free boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_account accounts%rowtype;
  v_client clients%rowtype;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_q record;
  v_label text;
  v_entitlement_id uuid;
  v_case_id uuid;
  v_prev uuid;
  v_counselor uuid;
  v_personal boolean := false;
  v_rally int;
  v_sla int;
begin
  if jsonb_typeof(v_answers) <> 'object' then
    raise exception 'survey_incomplete' using errcode = '22023';
  end if;

  select * into v_account from accounts where account_id = p_account_id for update;
  if not found or v_account.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_account.client_id is null then
    -- 所属のない利用者：サーバールートが「招待コードなしで相談できる利用者」と判定した場合だけ、無償の利用権で開始する
    if not coalesce(p_personal_free, false) then
      raise exception 'not_eligible' using errcode = '22023';
    end if;
    v_personal := true;
    v_rally := least(greatest(setting_int('personal_rally_max', 5), 1), 10);
    v_sla := 24;  -- 個人の利用は24時間で固定（要件 3.2.4）
  else
    if v_account.tier <> 'member' then
      raise exception 'not_eligible' using errcode = '22023';
    end if;
    select * into v_client from clients where client_id = v_account.client_id;
    if not found or v_client.status <> 'active' or not v_client.feature_consult then
      raise exception 'not_eligible' using errcode = '22023';
    end if;
    v_rally := v_client.rally_max;
    v_sla := v_client.sla_hours;
  end if;

  -- 自治体委託型は、相談内容が委託元へ報告されることへの同意が前提（要件 3.12.4）
  if v_client.contract_type = 'muni' and not coalesce(p_muni_consent, false) then
    raise exception 'consent_required' using errcode = '22023';
  end if;

  if exists (select 1 from cases where account_id = p_account_id and status = 'open') then
    raise exception 'case_already_open' using errcode = '22023';
  end if;

  -- 担当の割当（要件 3.6）：前回の担当が対応可能ならその人。いなければ、対応中の案件が最も少ない相談員。
  -- 【仮】自動割当（負荷分散）の対象は role = 'counselor' のみ。該当者がいなければ未割当とし、運営管理者が手動で割り当てる
  select k.counselor_id into v_prev
  from cases k
  where k.account_id = p_account_id and k.counselor_id is not null
  order by k.opened_at desc
  limit 1;

  if v_prev is not null and counselor_assignable(v_prev, v_client.client_id) then
    v_counselor := v_prev;
  else
    select c.counselor_id into v_counselor
    from counselors c
    where c.role = 'counselor' and counselor_assignable(c.counselor_id, v_client.client_id)
    order by (select count(*) from cases k where k.counselor_id = c.counselor_id and k.status = 'open'), random()
    limit 1;
  end if;

  -- 利用権：ラリー回数と返信SLAは、この時点のクライアント設定を複写する（要件 3.2.4・3.2.5）
  -- 所属のない利用者は、決済を伴わない無償の付与（source = payment・granted_free = true・有効期間なし）
  insert into entitlements (account_id, source, client_id, rally_max, sla_hours, granted_free)
  values (p_account_id, case when v_personal then 'payment' else 'client' end, v_client.client_id, v_rally, v_sla, v_personal)
  returning entitlement_id into v_entitlement_id;

  insert into cases (entitlement_id, account_id, client_id, counselor_id)
  values (v_entitlement_id, p_account_id, v_client.client_id, v_counselor)
  returning case_id into v_case_id;

  -- アンケート：回答時点の設問文・選択肢ラベルを複写して保存する（要件 3.11.8）
  for v_q in
    select q.survey_question_id, q.kind, q.question_text
    from survey_questions q
    where q.active
      and (q.client_id is null or q.client_id = v_client.client_id)
      and (
        q.kind = 'chief'
        or not exists (
          select 1 from account_attributes a
          where a.account_id = p_account_id and a.survey_question_id = q.survey_question_id
        )
      )
  loop
    select o.label into v_label
    from survey_options o
    where o.survey_question_id = v_q.survey_question_id
      and o.option_id::text = (v_answers ->> v_q.survey_question_id::text);
    if not found then
      raise exception 'survey_incomplete' using errcode = '22023';
    end if;

    if v_q.kind = 'attr' then
      insert into account_attributes (account_id, survey_question_id, question_text_snapshot, option_label_snapshot)
      values (p_account_id, v_q.survey_question_id, v_q.question_text, v_label);
    else
      insert into case_survey_answers (case_id, survey_question_id, kind, question_text_snapshot, option_label_snapshot)
      values (v_case_id, v_q.survey_question_id, 'chief', v_q.question_text, v_label);
    end if;
  end loop;

  -- 属性は、利用権付与時点の値を案件へ複写する（要件 3.11.4）
  insert into case_survey_answers (case_id, survey_question_id, kind, question_text_snapshot, option_label_snapshot)
  select v_case_id, a.survey_question_id, 'attr', a.question_text_snapshot, a.option_label_snapshot
  from account_attributes a
  join survey_questions q on q.survey_question_id = a.survey_question_id
  where a.account_id = p_account_id
    and q.active
    and (q.client_id is null or q.client_id = v_client.client_id);

  if v_client.contract_type = 'muni' then
    -- 【仮】同意文書の版は未整備のため仮の版名を記録する（要件 10.8）
    insert into consents (account_id, doc_type, doc_version) values (p_account_id, 'muni_report', 'draft-0');
  end if;

  return jsonb_build_object('case_id', v_case_id, 'assigned', v_counselor is not null);
end;
$$;

revoke execute on function user_start_case(uuid, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function user_start_case(uuid, jsonb, boolean, boolean) to service_role;

-- 無操作による自動終了：無償で付与した個人の相談にも適用する
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
      and (e.source = 'client' or e.granted_free)
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

-- 本人向けのビュー：自動終了の予定日時を、無償で付与した個人の相談にも出す（ほかの列は変更なし）
create or replace view my_cases with (security_invoker = false) as
 SELECT c.case_id,
    c.status,
    c.close_reason,
    c.opened_at,
    c.closed_at,
    c.client_id,
        CASE
            WHEN c.counselor_id IS NULL OR p.prev_counselor_id IS NULL THEN NULL::text
            WHEN c.counselor_id = p.prev_counselor_id THEN 'same'::text
            ELSE 'changed'::text
        END AS continuity,
    (EXISTS ( SELECT 1
           FROM messages m
          WHERE m.case_id = c.case_id AND m.sender = 'counselor'::text AND m.hidden_at IS NULL AND m.sent_at > COALESCE(( SELECT r.account_read_at
                   FROM case_reads r
                  WHERE r.case_id = c.case_id), '-infinity'::timestamp with time zone))) AS has_unread,
        CASE
            WHEN c.status = 'open'::text AND c.awaiting_reply_since IS NULL AND (EXISTS ( SELECT 1
               FROM entitlements e
              WHERE e.entitlement_id = c.entitlement_id AND (e.source = 'client'::text OR e.granted_free))) THEN c.last_activity_at + make_interval(days => COALESCE(( SELECT
                    CASE
                        WHEN s.setting_value ~ '^[0-9]{1,6}$'::text THEN s.setting_value::integer
                        ELSE NULL::integer
                    END AS "case"
               FROM system_settings s
              WHERE s.setting_key = 'idle_close_days'::text), 14))
            ELSE NULL::timestamp with time zone
        END AS idle_close_at
   FROM cases c
     LEFT JOIN LATERAL ( SELECT k.counselor_id AS prev_counselor_id
           FROM cases k
          WHERE k.account_id = c.account_id AND k.opened_at < c.opened_at
          ORDER BY k.opened_at DESC
         LIMIT 1) p ON true
  WHERE c.account_id = auth.uid() AND NOT (EXISTS ( SELECT 1
           FROM deletion_requests d
          WHERE d.target_type = 'case'::text AND d.target_id = c.case_id));
