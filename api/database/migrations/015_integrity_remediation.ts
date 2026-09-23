import type { DatabaseMigration } from './types';

export const integrityRemediationMigration: DatabaseMigration = {
  version: '015',
  name: 'integrity_remediation',
  checksum: '015-integrity-remediation-v2',
  async up(executor) {
    const userColumns = await executor.execute('PRAGMA table_info(users)');
    if (!userColumns.rows.some((row) => String(row.name) === 'auth_version')) {
      await executor.execute('ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1');
    }

    await executor.execute(`CREATE TABLE IF NOT EXISTS collaboration_document_locks (
      doc_id TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      locked_at INTEGER NOT NULL,
      user_id TEXT NOT NULL
    )`);
    await executor.execute(`CREATE TABLE IF NOT EXISTS collaboration_lock_events (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('locked', 'unlocked')),
      reason TEXT,
      user_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )`);
    await executor.execute(`CREATE INDEX IF NOT EXISTS idx_collaboration_lock_events_doc_time
      ON collaboration_lock_events(doc_id, timestamp DESC)`);

  },
};
