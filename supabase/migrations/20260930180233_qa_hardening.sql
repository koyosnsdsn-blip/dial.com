-- 機能1（Q&A）の補強
--
-- 1) 利用者が削除した投稿（hidden_at が入った投稿）を、運営側があとから処理できないようにする。
--    相談員が対応画面を開いている間に利用者が投稿を削除した場合でも、公開・却下・破棄・マージの操作で
--    削除済みの本文が書き戻されたり、破棄の回数に数えられたりしない
-- 2) 投稿が削除されたとき（本人による削除・退会・運営による削除）、匿名化のための修正の履歴（修正前の本文）も必ず消す

create or replace function guard_hidden_question()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.hidden_at is not null
     and (new.status is distinct from old.status
          or (new.body is distinct from old.body and new.body <> '（削除済み）')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

create trigger trg_questions_guard_hidden
  before update on questions
  for each row execute function guard_hidden_question();

create or replace function purge_edits_of_hidden_question()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.hidden_at is not null and old.hidden_at is null then
    delete from anonymization_edits where question_id = new.question_id;
  end if;
  return null;
end;
$$;

create trigger trg_questions_purge_edits
  after update on questions
  for each row execute function purge_edits_of_hidden_question();

revoke execute on function guard_hidden_question() from public, anon, authenticated;
revoke execute on function purge_edits_of_hidden_question() from public, anon, authenticated;
