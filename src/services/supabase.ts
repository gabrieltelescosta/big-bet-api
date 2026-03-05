import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

export interface Affiliate {
  id: string;
  name: string;
  email: string;
  password: string;
  active: boolean;
  base_url: string;
  start_date: string;
}

export interface RegistrationRow {
  affiliate_id: string;
  player_id: string;
  day: number;
  month: number;
  year: number;
  external_at: string;
  tracking_code: string;
  afp: string;
  status: string;
  qualification_date: string;
  player_country: string;
  ngr: number | null;
  ggr: number | null;
  first_deposit: number | null;
  first_deposit_date: string;
  net_deposits: number | null;
  deposit_count: number;
  affiliate_commissions: number | null;
  wagering: number | null;
  synced_at: string;
}

export interface SyncLog {
  affiliate_id: string;
  status: 'success' | 'error';
  records_count: number;
  error_message?: string;
  started_at: string;
  finished_at: string;
}

const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
);

export async function getActiveAffiliates(): Promise<Affiliate[]> {
  const { data, error } = await supabase
    .from('affiliates')
    .select('*')
    .eq('active', true);

  if (error) throw new Error(`Failed to fetch affiliates: ${error.message}`);
  return data as Affiliate[];
}

const UPSERT_BATCH_SIZE = 500;

export async function upsertRegistrations(rows: RegistrationRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from('registrations')
      .upsert(batch, { onConflict: 'affiliate_id,player_id,external_at' });

    if (error) {
      throw new Error(`Failed to upsert registrations (batch ${i}): ${error.message}`);
    }
  }
}

export async function createSyncLog(log: SyncLog): Promise<void> {
  const { error } = await supabase.from('sync_logs').insert(log);
  if (error) {
    console.error('Failed to create sync log:', error.message);
  }
}
