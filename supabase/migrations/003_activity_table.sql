-- ============================================================
-- Activity Table - aggregated financial data from /api/reports/activity
-- Run this in the Supabase SQL Editor
-- ============================================================

create table if not exists activity (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  player_id text not null,
  deposits numeric,
  deposit_count int not null default 0,
  withdrawals numeric,
  net_deposits numeric,
  commissions numeric,
  commission_count int not null default 0,
  ngr numeric,
  ggr numeric,
  position_count int not null default 0,
  wagering numeric,
  synced_at timestamptz not null default now(),

  constraint uq_activity unique (affiliate_id, player_id)
);

create index if not exists idx_activity_affiliate on activity(affiliate_id);
create index if not exists idx_activity_player on activity(player_id);
create index if not exists idx_activity_deposits on activity(deposits desc nulls last);
