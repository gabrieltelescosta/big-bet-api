import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

const app = express();

const VALID_ORDER_FIELDS = ['first_deposit', 'net_deposits', 'wagering'] as const;

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/ranking', async (req, res) => {
  try {
    const rawLimit = req.query.limit as string | undefined;
    const limit = rawLimit ? Math.max(parseInt(rawLimit) || 50, 1) : null;
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const affiliateId = (req.query.affiliate_id as string) || null;
    const orderBy = VALID_ORDER_FIELDS.includes(req.query.order_by as any)
      ? (req.query.order_by as string)
      : 'first_deposit';

    const [rankingResult, countResult] = await Promise.all([
      supabase.rpc('get_player_ranking', {
        p_limit: limit ?? 100000,
        p_offset: offset,
        p_affiliate_id: affiliateId,
        p_order_by: orderBy,
      }),
      supabase.rpc('get_player_ranking_count', {
        p_affiliate_id: affiliateId,
      }),
    ]);

    if (rankingResult.error) {
      throw new Error(rankingResult.error.message);
    }

    const total = countResult.data ?? 0;
    const data = (rankingResult.data ?? []).map((row: any, i: number) => ({
      position: offset + i + 1,
      ...row,
    }));

    res.json({ total, limit, offset, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Ranking error:', message);
    res.status(500).json({ error: message });
  }
});

export function startServer(): void {
  app.listen(config.port, () => {
    console.log(`API server running on http://localhost:${config.port}`);
    console.log(`  GET /api/ranking   - player deposit ranking`);
    console.log(`  GET /api/health    - healthcheck\n`);
  });
}
