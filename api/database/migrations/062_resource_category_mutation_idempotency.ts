import type { DatabaseMigration } from './types';

/** Store actor-scoped receipts for resource-category create, update, and delete requests. */
export const resourceCategoryMutationIdempotencyMigration: DatabaseMigration = {
  version: '062',
  name: 'resource_category_mutation_idempotency',
  checksum: '062-resource-category-mutation-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS resource_category_mutation_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
        library_type TEXT,
        target_category_id INTEGER,
        result_category_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_resource_category_mutation_actor
      ON resource_category_mutation_request_keys(actor_id, operation, created_at)
    `);

    const columns = await executor.execute('PRAGMA table_info(resource_category_mutation_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (![
      'client_request_id', 'actor_id', 'operation', 'library_type', 'target_category_id',
      'result_category_id', 'request_fingerprint', 'created_at',
    ].every((name) => columnNames.has(name))) {
      throw new Error('RESOURCE_CATEGORY_MUTATION_REQUEST_KEY_SCHEMA_INVALID');
    }
    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('RESOURCE_CATEGORY_MUTATION_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
