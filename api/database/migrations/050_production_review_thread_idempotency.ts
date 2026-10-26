import type { DatabaseMigration } from './types';

/** Store actor-scoped creation results so a lost response cannot duplicate a review thread. */
export const productionReviewThreadIdempotencyMigration: DatabaseMigration = {
  version: '050',
  name: 'production_review_thread_idempotency',
  checksum: '050-production-review-thread-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS production_review_thread_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        production_id INTEGER NOT NULL,
        thread_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_production_review_thread_actor_scope
      ON production_review_thread_request_keys(actor_id, production_id)
    `);

    const columns = await executor.execute('PRAGMA table_info(production_review_thread_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'production_id', 'thread_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('PRODUCTION_REVIEW_THREAD_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('PRODUCTION_REVIEW_THREAD_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
