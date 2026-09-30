-- 契約クライアントの契約終了（要件 3.10.5・7.10.9）
--
-- 契約終了時は、当該クライアントに所属する全アカウントの所属を一括して解除する。
--   - 解除後のアカウントは無料会員として継続する（要件 2.4）
--   - その時点で対応中の相談は、終了まで継続する（案件には付与時点のクライアントを複写済み。要件 3.10.5）
--   - 過去の相談記録は本人に帰属し、失われない（要件 8.6.3）
-- ステータスの変更と所属の解除を1トランザクションで行うため、関数にする。service_role のみ実行可。
--
-- 未対応：クライアント管理者アカウント（client_admins）の失効。クライアント管理サイトが未実装のため、今は対象がない。
--   実装時は「有効な管理者を1人以上残す」トリガ（trg_check_client_admin_min_active）との兼ね合いを整理すること。

create or replace function admin_close_client(p_client_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_detached int;
begin
  select status into v_status from clients where client_id = p_client_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status = 'closed' then
    raise exception 'already_closed' using errcode = '22023';
  end if;

  update clients set status = 'closed' where client_id = p_client_id;

  update accounts
  set client_id = null,
      tier = case when tier = 'member' then 'free' else tier end
  where client_id = p_client_id;
  get diagnostics v_detached = row_count;

  return jsonb_build_object('closed', true, 'detached', v_detached);
end;
$$;

revoke execute on function admin_close_client(uuid) from public, anon, authenticated;
grant execute on function admin_close_client(uuid) to service_role;
