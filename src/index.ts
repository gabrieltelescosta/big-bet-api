import cron from 'node-cron';
import { config } from './config';
import { runSync, runBackfill } from './jobs/sync-activity';
import { startServer } from './server';

const args = process.argv.slice(2);
const runNow = args.includes('--run-now');
const backfill = args.includes('--backfill');

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

async function main() {
  if (backfill) {
    const from = getArg('--from');
    const to = getArg('--to');

    if ((from && !to) || (!from && to)) {
      console.error('Both --from and --to are required when specifying a date range.');
      process.exit(1);
    }

    console.log('Running backfill...\n');
    await runBackfill(from, to);
    process.exit(0);
  }

  if (runNow) {
    console.log('Running sync immediately (--run-now)\n');
    await runSync();
    process.exit(0);
  }

  startServer();

  console.log(`Cron scheduler started: "${config.cronSchedule}"`);
  console.log('Running initial sync...\n');

  runSync().catch((err) => console.error('Initial sync error:', err));

  cron.schedule(config.cronSchedule, () => {
    runSync().catch((err) => console.error('Scheduled sync error:', err));
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
