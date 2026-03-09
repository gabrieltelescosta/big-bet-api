-- ============================================================
-- BigBet Tournament API - Full Schema Reset
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Drop existing functions
drop function if exists get_player_ranking;
drop function if exists get_player_ranking_count;
drop function if exists get_tournament_ranking;
drop function if exists get_tournament_ranking_count;
drop function if exists get_ranking_by_dates;
drop function if exists get_ranking_by_dates_count;
drop function if exists update_updated_at cascade;

-- Drop existing tables (order matters for FK refs)
drop table if exists sync_logs cascade;
drop table if exists activity cascade;
drop table if exists registrations cascade;
drop table if exists daily_activity cascade;
drop table if exists tournaments cascade;
drop table if exists affiliates cascade;

-- ============================================================
-- affiliates
-- ============================================================
create table affiliates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password text not null,
  active boolean not null default true,
  base_url text not null default 'https://afiliados.bigbetbr.com.br',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_affiliates_updated
  before update on affiliates
  for each row execute function update_updated_at();

-- ============================================================
-- tournaments
-- ============================================================
create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- daily_activity  (one row per affiliate + player + day)
-- ============================================================
create table daily_activity (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  player_id text not null,
  activity_date date not null,
  deposits numeric not null default 0,
  deposit_count int not null default 0,
  withdrawals numeric not null default 0,
  net_deposits numeric not null default 0,
  commissions numeric not null default 0,
  commission_count int not null default 0,
  ngr numeric not null default 0,
  ggr numeric not null default 0,
  position_count int not null default 0,
  wagering numeric not null default 0,
  synced_at timestamptz not null default now(),

  constraint uq_daily_activity unique (affiliate_id, player_id, activity_date)
);

create index idx_daily_activity_date on daily_activity(activity_date);
create index idx_daily_activity_player on daily_activity(player_id);
create index idx_daily_activity_deposits on daily_activity(deposits desc nulls last);
create index idx_daily_activity_affiliate on daily_activity(affiliate_id);

-- ============================================================
-- sync_logs
-- ============================================================
create table sync_logs (
  id bigint generated always as identity primary key,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  status text not null,
  records_count int not null default 0,
  sync_date date,
  error_message text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

create index idx_sync_logs_affiliate on sync_logs(affiliate_id);
create index idx_sync_logs_started on sync_logs(started_at desc);

-- ============================================================
-- Ranking function: sums daily_activity within tournament dates
-- Only players with deposits > 0 AND wagering > 0
-- ============================================================
create or replace function get_tournament_ranking(
  p_tournament_id uuid default null,
  p_limit int default 50,
  p_offset int default 0,
  p_order_by text default 'total_deposits'
)
returns table (
  player_id text,
  total_deposits numeric,
  total_deposit_count bigint,
  total_withdrawals numeric,
  total_wagering numeric,
  total_ngr numeric,
  days_active bigint
)
language plpgsql
as $$
declare
  v_start date;
  v_end date;
begin
  if p_tournament_id is not null then
    select t.start_date, t.end_date into v_start, v_end
    from tournaments t where t.id = p_tournament_id;
  else
    select t.start_date, t.end_date into v_start, v_end
    from tournaments t where t.active = true
    order by t.created_at desc limit 1;
  end if;

  if v_start is null then
    raise exception 'No tournament found';
  end if;

  return query
  select
    da.player_id,
    sum(da.deposits) as total_deposits,
    sum(da.deposit_count)::bigint as total_deposit_count,
    sum(da.withdrawals) as total_withdrawals,
    sum(da.wagering) as total_wagering,
    sum(da.ngr) as total_ngr,
    count(distinct da.activity_date) as days_active
  from daily_activity da
  where da.activity_date between v_start and v_end
  group by da.player_id
  having sum(da.deposits) > 0 and sum(da.wagering) > 0
  order by
    case p_order_by
      when 'total_wagering' then sum(da.wagering)
      else sum(da.deposits)
    end desc nulls last
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function get_tournament_ranking_count(
  p_tournament_id uuid default null
)
returns bigint
language plpgsql
as $$
declare
  v_start date;
  v_end date;
  total bigint;
begin
  if p_tournament_id is not null then
    select t.start_date, t.end_date into v_start, v_end
    from tournaments t where t.id = p_tournament_id;
  else
    select t.start_date, t.end_date into v_start, v_end
    from tournaments t where t.active = true
    order by t.created_at desc limit 1;
  end if;

  if v_start is null then
    return 0;
  end if;

  select count(*) into total
  from (
    select da.player_id
    from daily_activity da
    where da.activity_date between v_start and v_end
    group by da.player_id
    having sum(da.deposits) > 0 and sum(da.wagering) > 0
  ) sub;

  return total;
end;
$$;

-- ============================================================
-- Ranking by free date range (no tournament lookup)
-- ============================================================
create or replace function get_ranking_by_dates(
  p_from date,
  p_to date,
  p_limit int default 50,
  p_offset int default 0,
  p_order_by text default 'total_deposits'
)
returns table (
  player_id text,
  total_deposits numeric,
  total_deposit_count bigint,
  total_withdrawals numeric,
  total_wagering numeric,
  total_ngr numeric,
  days_active bigint
)
language plpgsql
as $$
begin
  return query
  select
    da.player_id,
    sum(da.deposits) as total_deposits,
    sum(da.deposit_count)::bigint as total_deposit_count,
    sum(da.withdrawals) as total_withdrawals,
    sum(da.wagering) as total_wagering,
    sum(da.ngr) as total_ngr,
    count(distinct da.activity_date) as days_active
  from daily_activity da
  where da.activity_date between p_from and p_to
  group by da.player_id
  having sum(da.deposits) > 0 and sum(da.wagering) > 0
  order by
    case p_order_by
      when 'total_wagering' then sum(da.wagering)
      else sum(da.deposits)
    end desc nulls last
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function get_ranking_by_dates_count(
  p_from date,
  p_to date
)
returns bigint
language plpgsql
as $$
declare
  total bigint;
begin
  select count(*) into total
  from (
    select da.player_id
    from daily_activity da
    where da.activity_date between p_from and p_to
    group by da.player_id
    having sum(da.deposits) > 0 and sum(da.wagering) > 0
  ) sub;

  return total;
end;
$$;

-- ============================================================
-- Seed data
-- ============================================================
insert into affiliates (name, email, password)
values ('OWSANTOS', 'wellintonjs@gmail.com', 'Senha.123@')
on conflict (email) do nothing;

insert into tournaments (name, start_date, end_date, active)
values ('Torneio de Depositos', '2026-03-10', '2026-05-10', true);
