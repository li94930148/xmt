import type { DatabaseMigration } from './types';

/** Keep create idempotency records outside user-visible inspiration rows. */
export const inspirationCreateIdempotencyMigration: DatabaseMigration = {
  version: '034',
  name: 'inspiration_create_idempotency',
  checksum: '034-inspiration-create-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS inspiration_create_request_keys (
        client_request_id TEXT PRIMARY KEY,
        creator_id INTEGER NOT NULL,
        inspiration_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(inspiration_create_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'creator_id', 'inspiration_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('INSPIRATION_CREATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('INSPIRATION_CREATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
