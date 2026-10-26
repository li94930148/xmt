import type { DatabaseMigration } from './types';

/** Preserve user-delete request outcomes after the deleted account is gone. */
export const userDeleteIdempotencyMigration: DatabaseMigration = {
  version: '041',
  name: 'user_delete_idempotency',
  checksum: '041-user-delete-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS user_delete_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        target_user_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(user_delete_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'target_user_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('USER_DELETE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('USER_DELETE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
