import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

export interface Affiliate {
  id: string;
  name: string;
  email: string;
  password: string;
  active: boolean;
  base_url: string;
}

export interface Tournament {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  active: boolean;
}

export interface DailyActivityRow {
  affiliate_id: string;
  player_id: string;
  activity_date: string;
  deposits: number;
  deposit_count: number;
  withdrawals: number;
  net_deposits: number;
  commissions: number;
  commission_count: number;
  ngr: number;
  ggr: number;
  position_count: number;
  wagering: number;
  synced_at: string;
}

export interface SyncLog {
  affiliate_id: string;
  status: 'success' | 'error';
  records_count: number;
  sync_date?: string;
  error_message?: string;
  started_at: string;
  finished_at: string;
}

const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
);

export { supabase };

export async function getActiveAffiliates(): Promise<Affiliate[]> {
  const { data, error } = await supabase
    .from('affiliates')
    .select('*')
    .eq('active', true);

  if (error) throw new Error(`Failed to fetch affiliates: ${error.message}`);
  return data as Affiliate[];
}

export async function getActiveTournaments(): Promise<Tournament[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch tournaments: ${error.message}`);
  return data as Tournament[];
}

export async function getActiveTournament(): Promise<Tournament | null> {
  const tournaments = await getActiveTournaments();
  return tournaments[0] ?? null;
}

/**
 * Returns dates (YYYY-MM-DD) within the range that have NO data
 * in daily_activity for the given affiliate.
 */
export async function getMissingDates(
  affiliateId: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('daily_activity')
    .select('activity_date')
    .eq('affiliate_id', affiliateId)
    .gte('activity_date', startDate)
    .lte('activity_date', endDate);

  if (error) throw new Error(`Failed to query existing dates: ${error.message}`);

  const existingDates = new Set((data ?? []).map((r: any) => r.activity_date));

  const missing: string[] = [];
  const current = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  while (current <= end && current <= today) {
    const dateStr = current.toISOString().slice(0, 10);
    if (!existingDates.has(dateStr)) {
      missing.push(dateStr);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return missing;
}

const UPSERT_BATCH_SIZE = 500;

export async function upsertDailyActivity(rows: DailyActivityRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from('daily_activity')
      .upsert(batch, { onConflict: 'affiliate_id,player_id,activity_date' });

    if (error) {
      throw new Error(`Failed to upsert daily_activity (batch ${i}): ${error.message}`);
    }
  }
}

export async function createSyncLog(log: SyncLog): Promise<void> {
  const { error } = await supabase.from('sync_logs').insert(log);
  if (error) {
    console.error('Failed to create sync log:', error.message);
  }
}
