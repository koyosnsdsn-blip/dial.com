-- 案件操作（返信・往復回数の調整・対応完了）と、返信待ちの起点時刻
--
-- 1) cases.awaiting_reply_since：相談者の送信のうち、まだ相談員が返信していない最初のものの時刻。
--    返信済み（または相談者の送信なし）のときは NULL。
--    SLAタイマーはこの起点時刻だけをサーバーから渡し、表示の更新はブラウザ側で計算する（CLAUDE.md 制約#6）。
-- 2) 返信などの操作は、案件の行をロックして1トランザクションで行う関数にする。
--    2人の相談員が同時に返信しても、往復回数の二重計上や上限超過が起きないようにするため。
--    関数は service_role（Nuxtのサーバールート）からのみ実行できる。ブラウザからは呼べない。
--
-- 往復回数の数え方（要件 3.3）：1往復＝相談員からの返信1回。相談者が何通送っても消費しない。
-- 上限（要件 3.2.5・7.3）：利用権付与時点の値（entitlements.rally_max）＋案件ごとの調整（rally_adjustments.delta の合計）。
-- 上限に達した返信の時点で案件をクローズする（close_reason = 'rally'）。

alter table cases add column awaiting_reply_since timestamptz;
comment on column cases.awaiting_reply_since is '未返信の相談者メッセージの最初の送信時刻。返信済みならNULL。SLAタイマーの起点（要件 3.2.1・7.3）';

-- 既存データの埋め戻し：最後の相談員の返信より後にある、相談者の最初の送信時刻
update cases c
set awaiting_reply_since = (
  select min(m.sent_at) from messages m
  where m.case_id = c.case_id
    and m.sender = 'user'
    and m.sent_at > coalesce(
      (select max(r.sent_at) from messages r where r.case_id = c.case_id and r.sender = 'counselor'),
      '-infinity'::timestamptz)
)
where c.status = 'open';

-- 案件の実効的な往復上限（付与時点の値＋調整の合計）
create or replace function case_rally_max(p_case_id uuid)
returns int
language sql
stable
set search_path = public
as $$
  select e.rally_max + coalesce((select sum(a.delta) from rally_adjustments a where a.case_id = c.case_id), 0)::int
  from cases c
  join entitlements e on e.entitlement_id = c.entitlement_id
  where c.case_id = p_case_id;
$$;

-- 相談員の返信
create or replace function staff_send_reply(p_case_id uuid, p_body text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_case cases%rowtype;
  v_max int;
  v_used int;
  v_message_id uuid;
  v_closed boolean := false;
begin
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'empty_body' using errcode = '22023';
  end if;

  select * into v_case from cases where case_id = p_case_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_case.status <> 'open' then
    raise exception 'case_closed' using errcode = '22023';
  end if;

  insert into messages (case_id, sender, body)
  values (p_case_id, 'counselor', p_body)
  returning message_id into v_message_id;

  v_used := v_case.rally_used + 1;
  v_max := case_rally_max(p_case_id);

  update cases
  set rally_used = v_used,
      last_activity_at = now(),
      awaiting_reply_since = null
  where case_id = p_case_id;

  if v_used >= v_max then
    update cases
    set status = 'closed', close_reason = 'rally', closed_at = now()
    where case_id = p_case_id;
    v_closed := true;
  end if;

  return jsonb_build_object('message_id', v_message_id, 'rally_used', v_used, 'rally_max', v_max, 'closed', v_closed);
end;
$$;

-- 往復回数の上限の調整（＋1／−1）。理由は必須。使用済みの回数を下回る上限にはできない。
create or replace function staff_adjust_rally(p_case_id uuid, p_delta int, p_reason text, p_counselor_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_case cases%rowtype;
  v_new_max int;
begin
  if p_delta not in (1, -1) then
    raise exception 'invalid_delta' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_case from cases where case_id = p_case_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_case.status <> 'open' then
    raise exception 'case_closed' using errcode = '22023';
  end if;

  v_new_max := case_rally_max(p_case_id) + p_delta;
  if v_new_max < 1 or v_new_max <= v_case.rally_used then
    raise exception 'below_used' using errcode = '22023';
  end if;

  insert into rally_adjustments (case_id, delta, reason, counselor_id)
  values (p_case_id, p_delta, btrim(p_reason), p_counselor_id);

  return jsonb_build_object('rally_used', v_case.rally_used, 'rally_max', v_new_max);
end;
$$;

-- 相談員による対応完了（要件 3.4.2）
create or replace function staff_close_case(p_case_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_case cases%rowtype;
begin
  select * into v_case from cases where case_id = p_case_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_case.status <> 'open' then
    raise exception 'case_closed' using errcode = '22023';
  end if;

  update cases
  set status = 'closed', close_reason = 'manual', closed_at = now(), awaiting_reply_since = null
  where case_id = p_case_id;

  return jsonb_build_object('closed', true, 'rally_used', v_case.rally_used, 'rally_max', case_rally_max(p_case_id));
end;
$$;

-- 実行権限：service_role のみ（ブラウザの anon / authenticated からは RPC で呼べない）
revoke execute on function case_rally_max(uuid) from public, anon, authenticated;
revoke execute on function staff_send_reply(uuid, text) from public, anon, authenticated;
revoke execute on function staff_adjust_rally(uuid, int, text, uuid) from public, anon, authenticated;
revoke execute on function staff_close_case(uuid) from public, anon, authenticated;
grant execute on function case_rally_max(uuid) to service_role;
grant execute on function staff_send_reply(uuid, text) to service_role;
grant execute on function staff_adjust_rally(uuid, int, text, uuid) to service_role;
grant execute on function staff_close_case(uuid) to service_role;
