-- 無償の個人の相談と、企業枠・有料の相談の並行、および利用者本人による相談の終了（2026-10-07 入江さんの指示）
--
-- 【経緯】
--   個人の無償の相談（ニックネーム登録）が対応中のあいだ、招待コードで企業会員になっても企業枠の相談を始められなかった。
--   無償の相談は、相談員の返信がないと（返信待ちの間は自動終了の対象外）長く残る。
--   下位の権利（無償）が、上位の権利（企業枠・将来の有料）の行使を止めるのは適切でないと判断した。
--
-- 【変更】
--   1) 案件に「枠」（slot）を持たせる。free＝無償の個人、main＝企業枠・（将来の）有料の個人。
--      同時に対応中にできるのは、枠ごとに1件まで（最大2件：無償1件＋企業枠または有料1件）。
--   2) 無償の相談は、何かが対応中のあいだは始められない（無償が増える、企業枠と並行して無償を使い続ける、を防ぐ）。
--   3) 利用者本人が、対応中の相談を自分で終了できるようにする（close_reason = 'user'）。
--   4) 本人向けのビュー my_cases に slot を追加する（画面で、無償の相談かどうかを見分けるため）。
--
-- 【未決】要件 3.2.1 は「同時に有効なメッセージボックスは1件まで（付与元を問わず）」。本変更はその例外（未決事項一覧 2.15）。
--         有料の個人（決済）を実装するときは、決済の前に main 枠の空きを確認すること。

alter table public.cases add column if not exists slot text not null default 'main' check (slot in ('free', 'main'));
comment on column public.cases.slot is '同時に対応中にできる枠。free＝無償の個人、main＝企業枠・有料の個人。枠ごとに対応中は1件まで';

update public.cases c
set slot = 'free'
from public.entitlements e
where e.entitlement_id = c.entitlement_id and e.granted_free and c.slot <> 'free';

drop index if exists public.uq_cases_one_open_per_account;
create unique index uq_cases_one_open_per_slot on public.cases (account_id, slot) where status = 'open';

alter table public.cases drop constraint if exists cases_close_reason_check;
alter table public.cases add constraint cases_close_reason_check
  check (close_reason in ('rally', 'expiry', 'idle', 'manual', 'user'));

-- 本人向けのビュー：末尾に slot を追加する（ほかの列は変更なし）
create or replace view public.my_cases with (security_invoker = false) as
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
        END AS idle_close_at,
    c.slot
   FROM cases c
     LEFT JOIN LATERAL ( SELECT k.counselor_id AS prev_counselor_id
           FROM cases k
          WHERE k.account_id = c.account_id AND k.opened_at < c.opened_at
          ORDER BY k.opened_at DESC
         LIMIT 1) p ON true
  WHERE c.account_id = auth.uid() AND NOT (EXISTS ( SELECT 1
           FROM deletion_requests d
          WHERE d.target_type = 'case'::text AND d.target_id = c.case_id));

-- 利用者本人による相談の終了
create or replace function user_close_case(p_account_id uuid, p_case_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_case cases%rowtype;
begin
  select * into v_case from cases where case_id = p_case_id and account_id = p_account_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_case.status <> 'open' then
    raise exception 'case_closed' using errcode = '22023';
  end if;

  update cases
  set status = 'closed', close_reason = 'user', closed_at = now(), awaiting_reply_since = null
  where case_id = p_case_id;

  return jsonb_build_object('closed', true);
end;
$$;

revoke execute on function user_close_case(uuid, uuid) from public, anon, authenticated;
grant execute on function user_close_case(uuid, uuid) to service_role;

-- 相談の開始：同時に対応中にできる件数を、枠ごとに判定する
create or replace function user_start_case(p_account_id uuid, p_answers jsonb, p_muni_consent boolean default false, p_personal_free boolean default false)
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

  -- 同時に進められる相談は、枠ごとに1件まで（2026-10-07 入江さんの指示）
  --   main：企業枠・（将来の）有料の個人。free：無償の個人。無償の相談が対応中でも、企業枠・有料の相談は始められる
  --   無償の相談は、何かが対応中のあいだは始められない（無償が2件になる、企業枠と並行して無償を使い続ける、を防ぐ）
  if v_personal then
    if exists (select 1 from cases where account_id = p_account_id and status = 'open') then
      raise exception 'case_already_open' using errcode = '22023';
    end if;
  elsif exists (select 1 from cases where account_id = p_account_id and status = 'open' and slot = 'main') then
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

  insert into cases (entitlement_id, account_id, client_id, counselor_id, slot)
  values (v_entitlement_id, p_account_id, v_client.client_id, v_counselor, case when v_personal then 'free' else 'main' end)
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
