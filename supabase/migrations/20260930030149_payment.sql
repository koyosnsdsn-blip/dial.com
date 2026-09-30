-- データモデル設計.md 第6章：決済
--
-- 保持期間は法定保存義務の対象（9.3の削除処理から除外し、本文とは別テーブルで保持）

create table payments (
  payment_id              uuid primary key default gen_random_uuid(),
  account_id              uuid not null references accounts(account_id),
  external_transaction_id text unique not null,
  amount                  int not null,
  status                  text not null check (status in ('succeeded', 'failed', 'refunded')),
  refund_reason           text,
  paid_at                 timestamptz,
  refunded_at             timestamptz
);

create table subscriptions (
  account_id                 uuid primary key references accounts(account_id),
  external_subscription_id   text unique not null,
  status                     text not null check (status in ('active', 'past_due', 'canceled')),
  current_period_end         timestamptz,
  grace_until                timestamptz  -- 決済失敗後の猶予期間（10.6）
);

-- entitlements.payment_id への FK を追加（entitlements は 004 で先に作成済み）
alter table entitlements
  add constraint fk_entitlements_payment
  foreign key (payment_id) references payments(payment_id);
