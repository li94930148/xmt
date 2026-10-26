import type { DatabaseMigration } from './types';

/** Durable actor-scoped receipts for legacy topic-template create, update, and delete mutations. */
export const topicTemplateMutationIdempotencyMigration: DatabaseMigration = {
  version: '064',
  name: 'topic_template_mutation_idempotency',
  checksum: '064-topic-template-mutation-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS topic_template_mutation_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
        target_template_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        base_fingerprint TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_topic_template_mutation_actor_target
      ON topic_template_mutation_request_keys(actor_id, operation, target_template_id, created_at)
    `);

    const columns = await executor.execute('PRAGMA table_info(topic_template_mutation_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (![
      'client_request_id', 'actor_id', 'operation', 'target_template_id', 'request_fingerprint', 'base_fingerprint', 'created_at',
    ].every((name) => columnNames.has(name))) {
      throw new Error('TOPIC_TEMPLATE_MUTATION_REQUEST_KEY_SCHEMA_INVALID');
    }
    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('TOPIC_TEMPLATE_MUTATION_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
