-- ============================================================
-- BigBet Affiliate Sync - Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Affiliates: stores login credentials per account
create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password text not null,
  active boolean not null default true,
  base_url text not null default 'https://afiliados.bigbetbr.com.br',
  start_date date not null default '2026-01-01',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Registrations: player data returned by the reports API
create table if not exists registrations (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  player_id text not null,
  day int not null,
  month int not null,
  year int not null,
  external_at text not null,
  tracking_code text not null default '',
  afp text not null default '',
  status text not null default '',
  qualification_date text not null default '',
  player_country text not null default '',
  ngr numeric,
  ggr numeric,
  first_deposit numeric,
  first_deposit_date text not null default '',
  net_deposits numeric,
  deposit_count int not null default 0,
  affiliate_commissions numeric,
  wagering numeric,
  synced_at timestamptz not null default now(),

  constraint uq_registration unique (affiliate_id, player_id, external_at)
);

-- Sync logs: one row per sync execution per affiliate
create table if not exists sync_logs (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  status text not null,
  records_count int not null default 0,
  error_message text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_registrations_affiliate on registrations(affiliate_id);
create index if not exists idx_registrations_external_at on registrations(external_at);
create index if not exists idx_registrations_player on registrations(player_id);
create index if not exists idx_sync_logs_affiliate on sync_logs(affiliate_id);
create index if not exists idx_sync_logs_started on sync_logs(started_at desc);

-- Auto-update updated_at on affiliates
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_affiliates_updated on affiliates;
create trigger trg_affiliates_updated
  before update on affiliates
  for each row execute function update_updated_at();

-- Seed: insert the first affiliate
insert into affiliates (name, email, password)
values ('OWSANTOS', 'wellintonjs@gmail.com', 'Senha.123@')
on conflict (email) do nothing;
