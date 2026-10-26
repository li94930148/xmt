import type { DatabaseMigration } from './types';

/** Keep user-update replay keys apart from user-visible account data. */
export const userUpdateIdempotencyMigration: DatabaseMigration = {
  version: '039',
  name: 'user_update_idempotency',
  checksum: '039-user-update-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS user_update_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        target_user_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(user_update_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'target_user_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('USER_UPDATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('USER_UPDATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
