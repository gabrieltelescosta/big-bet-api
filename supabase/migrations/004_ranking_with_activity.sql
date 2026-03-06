-- ============================================================
-- Updated Ranking Function - uses activity table for deposits
-- Joins activity (financial) with registrations (metadata)
-- Only includes players with deposits > 0 AND wagering > 0
-- Run this in the Supabase SQL Editor
-- ============================================================

drop function if exists get_player_ranking;

create or replace function get_player_ranking(
  p_limit int default 50,
  p_offset int default 0,
  p_affiliate_id uuid default null,
  p_order_by text default 'total_deposits'
)
returns table (
  player_id text,
  total_deposits numeric,
  withdrawals numeric,
  deposit_count int,
  wagering numeric,
  ngr numeric,
  afp text,
  player_country text,
  first_deposit_date text
)
language plpgsql
as $$
begin
  return query
  with latest_reg as (
    select distinct on (r.player_id, r.affiliate_id)
      r.player_id,
      r.affiliate_id,
      r.afp,
      r.player_country,
      r.first_deposit_date
    from registrations r
    order by r.player_id, r.affiliate_id, r.synced_at desc
  )
  select
    a.player_id,
    a.deposits as total_deposits,
    a.withdrawals,
    a.deposit_count,
    a.wagering,
    a.ngr,
    coalesce(lr.afp, '') as afp,
    coalesce(lr.player_country, '') as player_country,
    coalesce(lr.first_deposit_date, '') as first_deposit_date
  from activity a
  left join latest_reg lr
    on a.player_id = lr.player_id
    and a.affiliate_id = lr.affiliate_id
  where a.deposits > 0
    and a.wagering > 0
    and (p_affiliate_id is null or a.affiliate_id = p_affiliate_id)
  order by
    case p_order_by
      when 'wagering' then a.wagering
      else a.deposits
    end desc nulls last
  limit p_limit
  offset p_offset;
end;
$$;

-- Updated count function
drop function if exists get_player_ranking_count;

create or replace function get_player_ranking_count(
  p_affiliate_id uuid default null
)
returns bigint
language plpgsql
as $$
declare
  total bigint;
begin
  select count(distinct a.player_id) into total
  from activity a
  where a.deposits > 0
    and a.wagering > 0
    and (p_affiliate_id is null or a.affiliate_id = p_affiliate_id);
  return total;
end;
$$;
