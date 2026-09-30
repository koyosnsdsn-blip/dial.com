-- 相談者側の操作（招待コードによる所属の紐付け・相談の開始・メッセージ送信）と、初回アンケートの共通設問
--
-- 相談者側アプリ（apps/consultation）のサーバールートから、service_role でのみ実行する。
-- ブラウザ（anon / authenticated）からは RPC として呼べない（末尾で権限を剥奪する）。
--
-- 【仮の前提】未決事項に関わるため、次の2点は仮の値で実装している（docs/未決事項一覧_統合版.md に明記）。
--   1. 共通設問の文言・選択肢は要件 3.11.3 の案をそのまま使う（未決 No.38）
--   2. 相談の開始は企業枠（契約クライアントの所属者）のみ。個人の都度課金は未実装（未決 No.6）

-- ============================================================
-- 1) 初回アンケートの共通設問（client_id が NULL ＝ 全利用者共通）
--    すべての設問に「答えない」を設ける（要件 3.11.2）
-- ============================================================

insert into survey_questions (survey_question_id, client_id, kind, question_text, sort_order, aggregatable, active) values
  ('5e000000-0000-4000-8000-0000000000a1', null, 'attr',  '差し支えなければ、年代を教えてください', 10, false, true),
  ('5e000000-0000-4000-8000-0000000000a2', null, 'attr',  'これまでに、どこかへ相談されたことはありますか', 20, false, true),
  ('5e000000-0000-4000-8000-0000000000b1', null, 'chief', 'どなたについてのご相談ですか', 30, false, true),
  ('5e000000-0000-4000-8000-0000000000b2', null, 'chief', 'ご相談したい内容に近いものを選んでください', 40, false, true),
  ('5e000000-0000-4000-8000-0000000000b3', null, 'chief', 'お急ぎの度合いを教えてください', 50, false, true)
on conflict (survey_question_id) do nothing;

insert into survey_options (option_id, survey_question_id, label, sort_order) values
  ('5e000000-0000-4000-8000-00000000a101', '5e000000-0000-4000-8000-0000000000a1', '20代', 10),
  ('5e000000-0000-4000-8000-00000000a102', '5e000000-0000-4000-8000-0000000000a1', '30代', 20),
  ('5e000000-0000-4000-8000-00000000a103', '5e000000-0000-4000-8000-0000000000a1', '40代', 30),
  ('5e000000-0000-4000-8000-00000000a104', '5e000000-0000-4000-8000-0000000000a1', '50代以上', 40),
  ('5e000000-0000-4000-8000-00000000a199', '5e000000-0000-4000-8000-0000000000a1', '答えない', 990),

  ('5e000000-0000-4000-8000-00000000a201', '5e000000-0000-4000-8000-0000000000a2', 'ある', 10),
  ('5e000000-0000-4000-8000-00000000a202', '5e000000-0000-4000-8000-0000000000a2', 'ない', 20),
  ('5e000000-0000-4000-8000-00000000a299', '5e000000-0000-4000-8000-0000000000a2', '答えない', 990),

  ('5e000000-0000-4000-8000-00000000b101', '5e000000-0000-4000-8000-0000000000b1', 'ご自身', 10),
  ('5e000000-0000-4000-8000-00000000b102', '5e000000-0000-4000-8000-0000000000b1', 'ご家族・お子さん', 20),
  ('5e000000-0000-4000-8000-00000000b103', '5e000000-0000-4000-8000-0000000000b1', '部下・同僚', 30),
  ('5e000000-0000-4000-8000-00000000b104', '5e000000-0000-4000-8000-0000000000b1', 'その他', 40),
  ('5e000000-0000-4000-8000-00000000b199', '5e000000-0000-4000-8000-0000000000b1', '答えない', 990),

  ('5e000000-0000-4000-8000-00000000b201', '5e000000-0000-4000-8000-0000000000b2', '子育て', 10),
  ('5e000000-0000-4000-8000-00000000b202', '5e000000-0000-4000-8000-0000000000b2', '発達・就学', 20),
  ('5e000000-0000-4000-8000-00000000b203', '5e000000-0000-4000-8000-0000000000b2', '健康', 30),
  ('5e000000-0000-4000-8000-00000000b204', '5e000000-0000-4000-8000-0000000000b2', '職場の人間関係・ハラスメント', 40),
  ('5e000000-0000-4000-8000-00000000b205', '5e000000-0000-4000-8000-0000000000b2', 'その他', 50),
  ('5e000000-0000-4000-8000-00000000b299', '5e000000-0000-4000-8000-0000000000b2', '答えない', 990),

  ('5e000000-0000-4000-8000-00000000b301', '5e000000-0000-4000-8000-0000000000b3', 'すぐに話したい', 10),
  ('5e000000-0000-4000-8000-00000000b302', '5e000000-0000-4000-8000-0000000000b3', '数日以内', 20),
  ('5e000000-0000-4000-8000-00000000b303', '5e000000-0000-4000-8000-0000000000b3', '急がない', 30),
  ('5e000000-0000-4000-8000-00000000b399', '5e000000-0000-4000-8000-0000000000b3', '答えない', 990)
on conflict (option_id) do nothing;

-- ============================================================
-- 2) 招待コードによる所属の紐付け（要件 8.5）
--    コードが一致し、かつ契約ステータスが「有効」のクライアントだけ紐付ける。
--    「準備中」「終了」のクライアントのコードは、存在しないコードと同じ扱いにする（要件 7.10.9）。
-- ============================================================

create or replace function user_link_client(p_account_id uuid, p_code text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_code text := btrim(coalesce(p_code, ''));
  v_client_id uuid;
begin
  if v_code = '' then
    raise exception 'invalid_code' using errcode = '22023';
  end if;

  select client_id into v_client_id
  from clients
  where invite_code = v_code and status = 'active';
  if not found then
    raise exception 'invalid_code' using errcode = '22023';
  end if;

  update accounts
  set client_id = v_client_id, tier = 'member'
  where account_id = p_account_id and deleted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('linked', true);
end;
$$;

-- ============================================================
-- 3) 自動割当の対象になる相談員かどうか（要件 3.6・7.12.1）
--    有効であり、不在期間の外にあり、クライアントごとの限定（client_counselors）があればその中に含まれること。
--    不在期間の「今日」は日本時間の日付で判定する。
-- ============================================================

create or replace function counselor_assignable(p_counselor_id uuid, p_client_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from counselors c
    where c.counselor_id = p_counselor_id
      and c.status = 'active'
      and not (
        (c.absent_from is not null or c.absent_to is not null)
        and (now() at time zone 'Asia/Tokyo')::date >= coalesce(c.absent_from, '-infinity'::date)
        and (now() at time zone 'Asia/Tokyo')::date <= coalesce(c.absent_to, 'infinity'::date)
      )
      and (
        p_client_id is null
        or not exists (select 1 from client_counselors cc where cc.client_id = p_client_id)
        or exists (select 1 from client_counselors cc where cc.client_id = p_client_id and cc.counselor_id = c.counselor_id)
      )
  );
$$;

-- ============================================================
-- 4) 相談の開始（企業枠。要件 3.2.3・3.7・3.11・8.3）
--
--    p_answers：{"設問ID": "選択肢ID", ...}
--      - 主訴（chief）は毎回すべて必須
--      - 属性（attr）は、まだ回答のない設問だけ必須（2回目以降は聴取しない。要件 3.11.6）
--    同じ利用者の同時実行は accounts の行ロックで直列化し、有効な案件が2件できないようにする（要件 8.3）。
--    さらに部分ユニークインデックス uq_cases_one_open_per_account が最後の歯止めになる。
-- ============================================================

create or replace function user_start_case(p_account_id uuid, p_answers jsonb, p_muni_consent boolean default false)
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
begin
  if jsonb_typeof(v_answers) <> 'object' then
    raise exception 'survey_incomplete' using errcode = '22023';
  end if;

  select * into v_account from accounts where account_id = p_account_id for update;
  if not found or v_account.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_account.client_id is null or v_account.tier <> 'member' then
    raise exception 'not_eligible' using errcode = '22023';
  end if;

  select * into v_client from clients where client_id = v_account.client_id;
  if not found or v_client.status <> 'active' or not v_client.feature_consult then
    raise exception 'not_eligible' using errcode = '22023';
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
  insert into entitlements (account_id, source, client_id, rally_max, sla_hours)
  values (p_account_id, 'client', v_client.client_id, v_client.rally_max, v_client.sla_hours)
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

-- ============================================================
-- 5) 相談者のメッセージ送信（要件 3.2.1・3.3）
--    相談者が何通送っても往復回数は消費しない。
--    返信待ちの起点（awaiting_reply_since）は、未返信の最初の送信時刻だけを記録する（SLAタイマーの起点）。
-- ============================================================

create or replace function user_send_message(p_account_id uuid, p_case_id uuid, p_body text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_case cases%rowtype;
  v_message_id uuid;
  v_first boolean;
  v_now timestamptz := now();
begin
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'empty_body' using errcode = '22023';
  end if;
  if length(p_body) > 5000 then
    raise exception 'body_too_long' using errcode = '22023';
  end if;

  select * into v_case from cases where case_id = p_case_id for update;
  -- 他人の案件は「存在しない」と同じ応答にする
  if not found or v_case.account_id <> p_account_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_case.status <> 'open' then
    raise exception 'case_closed' using errcode = '22023';
  end if;

  v_first := not exists (select 1 from messages where case_id = p_case_id and sender = 'user');

  insert into messages (case_id, sender, body, sent_at)
  values (p_case_id, 'user', p_body, v_now)
  returning message_id into v_message_id;

  update cases
  set last_activity_at = v_now,
      awaiting_reply_since = coalesce(awaiting_reply_since, v_now)
  where case_id = p_case_id;

  return jsonb_build_object('message_id', v_message_id, 'first', v_first);
end;
$$;

-- ============================================================
-- 実行権限：service_role のみ
-- ============================================================

revoke execute on function user_link_client(uuid, text) from public, anon, authenticated;
revoke execute on function counselor_assignable(uuid, uuid) from public, anon, authenticated;
revoke execute on function user_start_case(uuid, jsonb, boolean) from public, anon, authenticated;
revoke execute on function user_send_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function user_link_client(uuid, text) to service_role;
grant execute on function counselor_assignable(uuid, uuid) to service_role;
grant execute on function user_start_case(uuid, jsonb, boolean) to service_role;
grant execute on function user_send_message(uuid, uuid, text) to service_role;
