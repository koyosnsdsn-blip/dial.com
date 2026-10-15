-- 追加設問（要件 3.11.8・7.10.5）の作成・書き換え・作り直しを、1回のトランザクションにまとめる。
-- 以前はアプリが「設問」と「選択肢」を別々の命令で書いていたため、途中で失敗すると
-- 選択肢のない設問が残ったり、取り下げただけで新しい設問ができていない状態になったりした（点検 2026-10-15）。
-- 呼び出せるのはサーバー（service_role）だけ。ブラウザ（anon・authenticated）には実行を許可しない。

-- 設問と選択肢を作る。選択肢の末尾に「答えない」（p_decline）を付ける。有効な設問が2問を超えるときは、既存のトリガが拒否する
create or replace function public.survey_create_question(
  p_client uuid, p_kind text, p_text text, p_sort int, p_aggregatable boolean, p_options text[], p_decline text
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  i int;
begin
  insert into survey_questions (client_id, kind, question_text, sort_order, aggregatable, active)
  values (p_client, p_kind, p_text, p_sort, p_aggregatable, true)
  returning survey_question_id into v_id;
  for i in 1 .. coalesce(array_length(p_options, 1), 0) loop
    insert into survey_options (survey_question_id, label, sort_order) values (v_id, p_options[i], i * 10);
  end loop;
  insert into survey_options (survey_question_id, label, sort_order) values (v_id, p_decline, 990);
  return v_id;
end;
$$;

-- 設問を取り下げ、新しい設問として作り直す（旧設問の集計をその時点で打ち切る）。回答の有無にかかわらず、設問の変更はこの関数で行う。
-- どちらかが失敗すれば、取り下げも取り消される
create or replace function public.survey_replace_question(
  p_old uuid, p_client uuid, p_kind text, p_text text, p_sort int, p_aggregatable boolean, p_options text[], p_decline text
) returns uuid
language plpgsql
set search_path = public
as $$
begin
  update survey_questions set active = false where survey_question_id = p_old;
  return public.survey_create_question(p_client, p_kind, p_text, p_sort, p_aggregatable, p_options, p_decline);
end;
$$;

revoke execute on function public.survey_create_question(uuid, text, text, int, boolean, text[], text) from public, anon, authenticated;
revoke execute on function public.survey_replace_question(uuid, uuid, text, text, int, boolean, text[], text) from public, anon, authenticated;
grant execute on function public.survey_create_question(uuid, text, text, int, boolean, text[], text) to service_role;
grant execute on function public.survey_replace_question(uuid, uuid, text, text, int, boolean, text[], text) to service_role;
