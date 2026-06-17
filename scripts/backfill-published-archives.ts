import { db, initDatabase } from '../api/database/db';
import { backfillPublishedArchives } from '../api/services/publishedArchive';

async function main() {
  await initDatabase();

  const summary = await backfillPublishedArchives();

  console.log('[backfill-published-archives] completed');
  console.log(`  total:   ${summary.total}`);
  console.log(`  created: ${summary.created}`);
  console.log(`  updated: ${summary.updated}`);
  console.log(`  skipped: ${summary.skipped}`);

  if (summary.results.length > 0) {
    console.log(`  topicIds: ${summary.results.map((item) => item.topicId).join(', ')}`);
  }

  db.close();
}

main().catch((error) => {
  console.error('[backfill-published-archives] failed:', error);
  db.close();
  process.exit(1);
});
