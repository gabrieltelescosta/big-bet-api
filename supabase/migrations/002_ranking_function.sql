-- ============================================================
-- Ranking Function - returns players ranked by deposit
-- Only includes players with wagering > 0 (validated deposits)
-- Run this in the Supabase SQL Editor
-- ============================================================

create or replace function get_player_ranking(
  p_limit int default 50,
  p_offset int default 0,
  p_affiliate_id uuid default null,
  p_order_by text default 'first_deposit'
)
returns table (
  player_id text,
  first_deposit numeric,
  net_deposits numeric,
  deposit_count int,
  wagering numeric,
  ngr numeric,
  afp text,
  player_country text,
  external_at text,
  first_deposit_date text
)
language plpgsql
as $$
begin
  return query
  with latest as (
    select distinct on (r.player_id)
      r.player_id,
      r.first_deposit,
      r.net_deposits,
      r.deposit_count,
      r.wagering,
      r.ngr,
      r.afp,
      r.player_country,
      r.external_at,
      r.first_deposit_date,
      r.synced_at
    from registrations r
    where r.wagering > 0
      and (p_affiliate_id is null or r.affiliate_id = p_affiliate_id)
    order by r.player_id, r.synced_at desc
  )
  select
    latest.player_id,
    latest.first_deposit,
    latest.net_deposits,
    latest.deposit_count,
    latest.wagering,
    latest.ngr,
    latest.afp,
    latest.player_country,
    latest.external_at,
    latest.first_deposit_date
  from latest
  order by
    case p_order_by
      when 'net_deposits' then latest.net_deposits
      when 'wagering' then latest.wagering
      else latest.first_deposit
    end desc nulls last
  limit p_limit
  offset p_offset;
end;
$$;

-- Count function for total/pagination
create or replace function get_player_ranking_count(
  p_affiliate_id uuid default null
)
returns bigint
language plpgsql
as $$
declare
  total bigint;
begin
  select count(distinct r.player_id) into total
  from registrations r
  where r.wagering > 0
    and (p_affiliate_id is null or r.affiliate_id = p_affiliate_id);
  return total;
end;
$$;
