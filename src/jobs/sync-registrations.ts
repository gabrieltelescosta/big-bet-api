import { BigBetClient, RegistrationRecord } from '../services/bigbet-client';
import {
  Affiliate,
  RegistrationRow,
  getActiveAffiliates,
  upsertRegistrations,
  createSyncLog,
} from '../services/supabase';

function formatDate(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

function todayFormatted(): string {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
}

function mapToRow(affiliateId: string, rec: RegistrationRecord): RegistrationRow {
  return {
    affiliate_id: affiliateId,
    player_id: rec.playerId,
    day: rec.day,
    month: rec.month,
    year: rec.year,
    external_at: rec.externalAt,
    tracking_code: rec.trackingCode ?? '',
    afp: rec.afp ?? '',
    status: rec.status ?? '',
    qualification_date: rec.qualificationDate ?? '',
    player_country: rec.playerCountry ?? '',
    ngr: rec.ngr,
    ggr: rec.ggr,
    first_deposit: rec.firstDeposit,
    first_deposit_date: rec.firstDepositDate ?? '',
    net_deposits: rec.netDeposits,
    deposit_count: rec.depositCount ?? 0,
    affiliate_commissions: rec.affiliateCommissions,
    wagering: rec.wagering,
    synced_at: new Date().toISOString(),
  };
}

async function syncAffiliate(affiliate: Affiliate): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(`[${affiliate.name}] Starting sync...`);

  try {
    const client = new BigBetClient(affiliate.base_url);

    console.log(`  Logging in as ${affiliate.email}...`);
    await client.login(affiliate.email, affiliate.password);

    const from = formatDate(new Date(affiliate.start_date));
    const to = todayFormatted();

    console.log(`  Fetching registrations from ${from} to ${to}...`);
    const records = await client.fetchRegistrations(from, to);
    console.log(`  Received ${records.length} records`);

    if (records.length > 0) {
      const rows = records.map((r) => mapToRow(affiliate.id, r));
      await upsertRegistrations(rows);
      console.log(`  Upserted ${rows.length} rows into Supabase`);
    }

    await createSyncLog({
      affiliate_id: affiliate.id,
      status: 'success',
      records_count: records.length,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    console.log(`[${affiliate.name}] Sync completed successfully\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${affiliate.name}] Sync failed: ${message}\n`);

    await createSyncLog({
      affiliate_id: affiliate.id,
      status: 'error',
      records_count: 0,
      error_message: message,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
  }
}

export async function runSync(): Promise<void> {
  console.log(`=== Sync started at ${new Date().toISOString()} ===\n`);

  const affiliates = await getActiveAffiliates();
  console.log(`Found ${affiliates.length} active affiliate(s)\n`);

  for (const affiliate of affiliates) {
    await syncAffiliate(affiliate);
  }

  console.log(`=== Sync finished at ${new Date().toISOString()} ===\n`);
}
