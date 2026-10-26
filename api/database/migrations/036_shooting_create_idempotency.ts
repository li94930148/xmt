import type { DatabaseMigration } from './types';

/** Keep shooting create replay keys outside user-visible shooting rows. */
export const shootingCreateIdempotencyMigration: DatabaseMigration = {
  version: '036',
  name: 'shooting_create_idempotency',
  checksum: '036-shooting-create-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS shooting_create_request_keys (
        client_request_id TEXT PRIMARY KEY,
        creator_id INTEGER NOT NULL,
        shooting_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(shooting_create_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'creator_id', 'shooting_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('SHOOTING_CREATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('SHOOTING_CREATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
