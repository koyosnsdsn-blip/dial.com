-- 運営画面の通知音の設定（2026-10-09 ダイヤルさんの希望：鳴らすか・どれを鳴らすかは、相談員・運営管理者ごとに本人が決める）
--
-- 【仮】
--   - 本人のアカウントに保存する（ブラウザごとの保存ではなく、別のPC・別のブラウザでも同じ設定になる）。
--   - 行がないときは「通知音は鳴らさない」（初期値OFF。種類ごとの初期値は、すべて鳴らす）。
--   - ブラウザからは読み書きできない（サーバールート /api/ops/notify-prefs 経由。本人の行だけを扱う）。
--   - 緊急の音も本人が切れる。切れないようにするか（運営管理者が強制ONにするか）は未決事項一覧 2.20。
--   - 相談員の登録を消したら、設定も消える。

create table if not exists public.staff_notify_prefs (
  counselor_id   uuid primary key references public.counselors(counselor_id) on delete cascade,
  sound_enabled  boolean not null default false,
  notify_message boolean not null default true,
  notify_case    boolean not null default true,
  notify_urgent  boolean not null default true,
  updated_at     timestamptz not null default now()
);

comment on table public.staff_notify_prefs is '運営画面の通知音の設定（本人ごと）。ブラウザからは読み書きしない';

alter table public.staff_notify_prefs enable row level security;
revoke all on public.staff_notify_prefs from anon, authenticated;
grant all on public.staff_notify_prefs to service_role;
