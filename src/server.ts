import express from 'express';
import { config } from './config';
import { supabase, getActiveTournament } from './services/supabase';

const app = express();

const VALID_ORDER_FIELDS = ['total_deposits', 'total_wagering'] as const;

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

interface DateRange {
  from: string;
  to: string;
  tournament?: { id: string; name: string; start_date: string; end_date: string };
}

async function resolveDateRange(query: Record<string, any>): Promise<DateRange | null> {
  const from = query.from as string | undefined;
  const to = query.to as string | undefined;

  if (from && to) {
    return { from, to };
  }

  const tournamentId = (query.tournament_id as string) || null;
  const tournament = tournamentId
    ? (await supabase.from('tournaments').select('*').eq('id', tournamentId).single()).data
    : await getActiveTournament();

  if (!tournament) return null;

  return {
    from: tournament.start_date,
    to: tournament.end_date,
    tournament: {
      id: tournament.id,
      name: tournament.name,
      start_date: tournament.start_date,
      end_date: tournament.end_date,
    },
  };
}

app.get('/api/ranking', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 10000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const orderBy = VALID_ORDER_FIELDS.includes(req.query.order_by as any)
      ? (req.query.order_by as string)
      : 'total_deposits';

    const range = await resolveDateRange(req.query);
    if (!range) {
      res.status(404).json({ error: 'No active tournament found and no from/to provided' });
      return;
    }

    const [rankingResult, countResult] = range.tournament
      ? await Promise.all([
          supabase.rpc('get_tournament_ranking', {
            p_tournament_id: range.tournament.id,
            p_limit: limit,
            p_offset: offset,
            p_order_by: orderBy,
          }),
          supabase.rpc('get_tournament_ranking_count', {
            p_tournament_id: range.tournament.id,
          }),
        ])
      : await Promise.all([
          supabase.rpc('get_ranking_by_dates', {
            p_from: range.from,
            p_to: range.to,
            p_limit: limit,
            p_offset: offset,
            p_order_by: orderBy,
          }),
          supabase.rpc('get_ranking_by_dates_count', {
            p_from: range.from,
            p_to: range.to,
          }),
        ]);

    if (rankingResult.error) throw new Error(rankingResult.error.message);

    const total = countResult.data ?? 0;
    const data = (rankingResult.data ?? []).map((row: any, i: number) => ({
      position: offset + i + 1,
      ...row,
    }));

    res.json({
      ...(range.tournament ? { tournament: range.tournament } : {}),
      from: range.from,
      to: range.to,
      total,
      limit,
      offset,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Ranking error:', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/ranking/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;

    const range = await resolveDateRange(req.query);
    if (!range) {
      res.status(404).json({ error: 'No active tournament found and no from/to provided' });
      return;
    }

    const { data, error } = await supabase
      .from('daily_activity')
      .select('activity_date, deposits, deposit_count, withdrawals, net_deposits, wagering, ngr, ggr, position_count')
      .eq('player_id', playerId)
      .gte('activity_date', range.from)
      .lte('activity_date', range.to)
      .order('activity_date', { ascending: true });

    if (error) throw new Error(error.message);

    const days = data ?? [];
    const totals = days.reduce(
      (acc, d) => ({
        total_deposits: acc.total_deposits + Number(d.deposits),
        total_deposit_count: acc.total_deposit_count + Number(d.deposit_count),
        total_withdrawals: acc.total_withdrawals + Number(d.withdrawals),
        total_wagering: acc.total_wagering + Number(d.wagering),
        total_ngr: acc.total_ngr + Number(d.ngr),
      }),
      { total_deposits: 0, total_deposit_count: 0, total_withdrawals: 0, total_wagering: 0, total_ngr: 0 },
    );

    res.json({
      player_id: playerId,
      ...(range.tournament ? { tournament: range.tournament } : {}),
      from: range.from,
      to: range.to,
      ...totals,
      days_active: days.length,
      daily: days,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Player detail error:', message);
    res.status(500).json({ error: message });
  }
});

export function startServer(): void {
  app.listen(config.port, () => {
    console.log(`API server running on http://localhost:${config.port}`);
    console.log(`  GET /api/health              - healthcheck`);
    console.log(`  GET /api/ranking             - deposit ranking (tournament or from/to)`);
    console.log(`  GET /api/ranking/:playerId   - player daily breakdown\n`);
  });
}
