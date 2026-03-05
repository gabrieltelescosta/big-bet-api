import cron from 'node-cron';
import { config } from './config';
import { runSync } from './jobs/sync-registrations';
import { startServer } from './server';

const runNow = process.argv.includes('--run-now');

async function main() {
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
