import type { DatabaseMigration } from './types';

/** Store actor-scoped create results without changing announcement rows. */
export const announcementCreateIdempotencyMigration: DatabaseMigration = {
  version: '048',
  name: 'announcement_create_idempotency',
  checksum: '048-announcement-create-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS announcement_create_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        announcement_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_announcement_create_actor
      ON announcement_create_request_keys(actor_id)
    `);

    const columns = await executor.execute('PRAGMA table_info(announcement_create_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'announcement_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('ANNOUNCEMENT_CREATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('ANNOUNCEMENT_CREATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
