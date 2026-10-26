import type { DatabaseMigration } from './types';

/** Preserve the result of a message clear so retries cannot delete later arrivals. */
export const messageClearIdempotencyMigration: DatabaseMigration = {
  version: '042',
  name: 'message_clear_idempotency',
  checksum: '042-message-clear-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS message_clear_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        deleted_count INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(message_clear_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'deleted_count', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('MESSAGE_CLEAR_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('MESSAGE_CLEAR_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
