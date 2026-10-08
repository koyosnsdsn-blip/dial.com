-- IP制限（2026-10-08 ダイヤルさんの指示）
--
--   block              … サイト全体の拒否リスト。危険と名指しされた接続元（JPCERT・警察などの公表）を、画面・APIとも拒否する。
--                         相談者側も対象だが、許可リスト（＝この接続元からしか使えない）ではないので、要件 8.6.4 に反しない。
--   client_admin_allow … クライアント管理サイトの許可リスト（要件 8.8.1・8.8.3）。クライアント単位。
--                         1件でも登録があれば、そのクライアントの管理者は、登録した接続元からしか管理サイトのAPIを使えない。
--                         設定は当社（運営管理者）が行う。クライアント管理サイトからは変更できない。未設定なら制限しない。
--
-- ブラウザからは読み書きできない（RLS＋権限なし）。サーバールート経由で、変更は監査ログに残す。
-- cidr 型なので、形式の誤り（例：192.168.1.1/24 のようにホスト部が0でない）はDBが拒否する。

create table if not exists public.ip_rules (
  rule_id     uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('block', 'client_admin_allow')),
  client_id   uuid references public.clients(client_id),
  cidr        cidr not null,
  note        text check (note is null or length(note) <= 200),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.counselors(counselor_id),
  constraint ip_rules_client_scope check (
    (kind = 'block' and client_id is null) or (kind = 'client_admin_allow' and client_id is not null)
  )
);

create unique index if not exists uq_ip_rules on public.ip_rules (kind, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid), cidr);
create index if not exists ix_ip_rules_client on public.ip_rules (client_id) where client_id is not null;

comment on table public.ip_rules is 'IP制限。block＝サイト全体の拒否リスト、client_admin_allow＝クライアント管理サイトの許可リスト（クライアント単位、8.8.3）';

alter table public.ip_rules enable row level security;
revoke all on public.ip_rules from anon, authenticated;
grant all on public.ip_rules to service_role;
