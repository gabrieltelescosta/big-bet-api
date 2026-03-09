import { BigBetClient, ActivityRecord } from '../services/bigbet-client';
import {
  Affiliate,
  DailyActivityRow,
  getActiveAffiliates,
  getActiveTournaments,
  getMissingDates,
  upsertDailyActivity,
  createSyncLog,
} from '../services/supabase';

function formatDateForApi(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function mapToRow(affiliateId: string, rec: ActivityRecord, activityDate: string): DailyActivityRow {
  return {
    affiliate_id: affiliateId,
    player_id: rec.playerId,
    activity_date: activityDate,
    deposits: rec.deposits ?? 0,
    deposit_count: rec.depositCount ?? 0,
    withdrawals: rec.withdrawals ?? 0,
    net_deposits: rec.netDeposits ?? 0,
    commissions: rec.commissions ?? 0,
    commission_count: rec.commissionCount ?? 0,
    ngr: rec.ngr ?? 0,
    ggr: rec.ggr ?? 0,
    position_count: rec.positionCount ?? 0,
    wagering: rec.wagering ?? 0,
    synced_at: new Date().toISOString(),
  };
}

async function fetchAndUpsertDay(
  client: BigBetClient,
  affiliateId: string,
  dateStr: string,
): Promise<number> {
  const apiDate = formatDateForApi(dateStr);
  const records = await client.fetchActivity(apiDate, apiDate);

  if (records.length === 0) return 0;

  const rows = records.map((r) => mapToRow(affiliateId, r, dateStr));
  await upsertDailyActivity(rows);
  return rows.length;
}

async function syncAffiliateDays(
  affiliate: Affiliate,
  dates: string[],
): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(`[${affiliate.name}] Syncing ${dates.length} day(s): ${dates[0]} → ${dates[dates.length - 1]}`);

  try {
    const client = new BigBetClient(affiliate.base_url);
    console.log(`  Logging in as ${affiliate.email}...`);
    await client.login(affiliate.email, affiliate.password);

    let totalRecords = 0;

    for (const dateStr of dates) {
      const count = await fetchAndUpsertDay(client, affiliate.id, dateStr);
      totalRecords += count;
      if (count > 0) {
        console.log(`  ${dateStr}: ${count} records`);
      }
    }

    await createSyncLog({
      affiliate_id: affiliate.id,
      status: 'success',
      records_count: totalRecords,
      sync_date: dates[dates.length - 1],
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    console.log(`[${affiliate.name}] Done — ${totalRecords} total records\n`);
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

  const dates = [yesterdayStr(), todayStr()];
  console.log(`Fetching dates: ${dates.join(', ')}\n`);

  for (const affiliate of affiliates) {
    await syncAffiliateDays(affiliate, dates);
  }

  console.log(`=== Sync finished at ${new Date().toISOString()} ===\n`);
}

export async function runBackfill(fromDate?: string, toDate?: string): Promise<void> {
  console.log(`=== Backfill started at ${new Date().toISOString()} ===\n`);

  const affiliates = await getActiveAffiliates();

  if (fromDate && toDate) {
    console.log(`Using explicit date range: ${fromDate} → ${toDate}\n`);

    for (const affiliate of affiliates) {
      console.log(`[${affiliate.name}] Checking missing dates for ${fromDate} → ${toDate}...`);

      const missing = await getMissingDates(affiliate.id, fromDate, toDate);

      if (missing.length === 0) {
        console.log(`  No missing dates — up to date.\n`);
        continue;
      }

      console.log(`  ${missing.length} missing day(s) to fetch.\n`);
      await syncAffiliateDays(affiliate, missing);
    }
  } else {
    const tournaments = await getActiveTournaments();

    if (tournaments.length === 0) {
      console.log('No active tournaments found and no --from/--to provided. Nothing to backfill.\n');
      return;
    }

    console.log(`Found ${affiliates.length} affiliate(s), ${tournaments.length} tournament(s)\n`);

    for (const affiliate of affiliates) {
      for (const tournament of tournaments) {
        console.log(`[${affiliate.name}] Checking missing dates for "${tournament.name}"...`);

        const missing = await getMissingDates(
          affiliate.id,
          tournament.start_date,
          tournament.end_date,
        );

        if (missing.length === 0) {
          console.log(`  No missing dates — up to date.\n`);
          continue;
        }

        console.log(`  ${missing.length} missing day(s) to fetch.\n`);
        await syncAffiliateDays(affiliate, missing);
      }
    }
  }

  console.log(`=== Backfill finished at ${new Date().toISOString()} ===\n`);
}
