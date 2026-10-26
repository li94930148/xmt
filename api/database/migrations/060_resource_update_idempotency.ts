import type { DatabaseMigration } from './types';

/** Persist actor-scoped resource-update receipts without changing existing resource rows. */
export const resourceUpdateIdempotencyMigration: DatabaseMigration = {
  version: '060',
  name: 'resource_update_idempotency',
  checksum: '060-resource-update-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS resource_update_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        resource_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_resource_update_actor_resource
      ON resource_update_request_keys(actor_id, resource_id)
    `);

    const columns = await executor.execute('PRAGMA table_info(resource_update_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'resource_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('RESOURCE_UPDATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('RESOURCE_UPDATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
