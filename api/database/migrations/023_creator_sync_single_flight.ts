import type { DatabaseMigration } from './types';

/** Prevent two API processes from syncing the same Creator Agent account concurrently. */
export const creatorSyncSingleFlightMigration: DatabaseMigration = {
  version: '023',
  name: 'creator_sync_single_flight',
  checksum: '023-creator-sync-single-flight-v1',
  async up(executor) {
    const duplicateCreatorSyncs = await executor.execute(`SELECT platform, account, COUNT(*) AS run_count
      FROM creator_sync_tasks
      WHERE status = 'running' AND account <> ''
      GROUP BY platform, account
      HAVING COUNT(*) > 1`);
    if (duplicateCreatorSyncs.rows.length > 0) {
      throw new Error(`Cannot enforce one active Creator Agent sync per account: ${duplicateCreatorSyncs.rows.length} account(s) already have multiple running tasks. Review those tasks before retrying migration 023; no tasks were changed.`);
    }

    await executor.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_sync_tasks_one_running_per_account
      ON creator_sync_tasks(platform, account)
      WHERE status = 'running' AND account <> ''`);
  },
};
