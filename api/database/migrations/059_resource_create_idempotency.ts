import type { DatabaseMigration } from './types';

/** Persist actor-scoped resource-create receipts without changing existing resource rows. */
export const resourceCreateIdempotencyMigration: DatabaseMigration = {
  version: '059',
  name: 'resource_create_idempotency',
  checksum: '059-resource-create-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS resource_create_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        resource_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_resource_create_actor
      ON resource_create_request_keys(actor_id)
    `);

    const columns = await executor.execute('PRAGMA table_info(resource_create_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'resource_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('RESOURCE_CREATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('RESOURCE_CREATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
