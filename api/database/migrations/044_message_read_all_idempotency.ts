import type { DatabaseMigration } from './types';

/** Preserve account-scoped message read-all outcomes for safe client retries. */
export const messageReadAllIdempotencyMigration: DatabaseMigration = {
  version: '044',
  name: 'message_read_all_idempotency',
  checksum: '044-message-read-all-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS message_read_all_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        updated_count INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(message_read_all_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'updated_count', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('MESSAGE_READ_ALL_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('MESSAGE_READ_ALL_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
