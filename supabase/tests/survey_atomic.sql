-- 追加設問の原子的な操作のテスト（2026-10-15）
--   S1 作成：設問と、選択肢（指定分＋「答えない」）が揃う
--   S3 作り直し：旧設問が取り下げになり、新設問ができる
--   S4 有効な設問が2問ある状態で作り直しに失敗しても、旧設問は取り下げにならない（全体が取り消される）
--   S5 ブラウザ（anon・authenticated）は実行できない
-- 最後に必ず例外を投げて取り消すため、テストデータは残らない。
do $$
declare
  cl uuid := gen_random_uuid(); q1 uuid; q2 uuid; q3 uuid; q4 uuid; n int; failures text := ''; failed boolean;
begin
  insert into clients (client_id, name, contract_type, status, feature_consult, rally_max, sla_hours) values (cl, 'S設問', 'corp', 'active', true, 2, 12);

  q1 := survey_create_question(cl, 'attr', '設問1', 100, false, array['a','b'], '答えない');
  select count(*) into n from survey_options where survey_question_id = q1;
  if n <> 3 then failures := failures || format('S1 選択肢の数が違う（%s）; ', n); end if;
  if not exists (select 1 from survey_options where survey_question_id = q1 and label = '答えない' and sort_order = 990) then failures := failures || 'S1 答えないが無い; '; end if;

  q2 := survey_replace_question(q1, cl, 'attr', '設問1新', 100, false, array['p','q'], '答えない');
  if (select active from survey_questions where survey_question_id = q1) then failures := failures || 'S3 旧設問が取り下げになっていない; '; end if;
  if not (select active from survey_questions where survey_question_id = q2) then failures := failures || 'S3 新設問が有効でない; '; end if;

  -- 有効な設問を2問にして、3問目を作ろうとすると失敗する。作り直しがそこで失敗したら、旧設問の取り下げも取り消される
  q3 := survey_create_question(cl, 'attr', '設問2', 110, false, array['m','n'], '答えない');
  failed := false;
  begin
    q4 := survey_create_question(cl, 'attr', '設問3', 120, false, array['m','n'], '答えない');
  exception when others then failed := true;
  end;
  if not failed then failures := failures || 'S4 3問目が作れてしまった; '; end if;
  -- 作り直し：取り下げ→作成の順なので、2問のままなら成功する。ここでは、作成が失敗する入力（選択肢の重複キーは無いので、client を存在しない値に）で確かめる
  begin
    perform survey_replace_question(q3, gen_random_uuid(), 'attr', '設問2新', 110, false, array['m','n'], '答えない');
    failures := failures || 'S4 存在しないクライアントで作り直せた; ';
  exception when others then null;
  end;
  if not (select active from survey_questions where survey_question_id = q3) then failures := failures || 'S4 失敗したのに旧設問が取り下げになった; '; end if;

  -- S5
  set local role authenticated;
  begin
    perform survey_create_question(cl, 'attr', 'x', 1, false, array['a','b'], '答えない');
    failures := failures || 'S5 authenticated が実行できた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role anon;
  begin
    perform survey_create_question(cl, 'attr', 'x', 1, false, array['a','b'], '答えない');
    failures := failures || 'S5 anon が実行できた; ';
  exception when insufficient_privilege then null;
  end;
  reset role;

  if failures <> '' then raise exception 'survey_atomic FAILED: %', failures; end if;
  raise exception 'survey_atomic PASSED（テストデータは取り消されます）';
end $$;
