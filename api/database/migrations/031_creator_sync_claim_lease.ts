import type { DatabaseMigration } from './types';

const DATABASE_NOW_MS = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";

/** Store a server-clock claim time so abandoned Creator Agent syncs can be reclaimed safely. */
export const creatorSyncClaimLeaseMigration: DatabaseMigration = {
  version: '031',
  name: 'creator_sync_claim_lease',
  checksum: '031-creator-sync-claim-lease-v1',
  async up(executor) {
    const columns = await executor.execute('PRAGMA table_info(creator_sync_tasks)');
    if (!columns.rows.some((column) => String(column.name) === 'claimed_at_ms')) {
      await executor.execute('ALTER TABLE creator_sync_tasks ADD COLUMN claimed_at_ms INTEGER NOT NULL DEFAULT 0');
    }

    // Existing active rows receive a fresh grace period; their client-supplied
    // start_time is not a trustworthy server-side lease timestamp.
    await executor.execute(`UPDATE creator_sync_tasks
      SET claimed_at_ms = ${DATABASE_NOW_MS}
      WHERE status = 'running' AND claimed_at_ms = 0`);

    const verified = await executor.execute('PRAGMA table_info(creator_sync_tasks)');
    if (!verified.rows.some((column) => String(column.name) === 'claimed_at_ms')) {
      throw new Error('CREATOR_SYNC_CLAIM_LEASE_COLUMN_MISSING');
    }
  },
};
