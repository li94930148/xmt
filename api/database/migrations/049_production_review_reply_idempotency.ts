import type { DatabaseMigration } from './types';

/** Preserve actor-scoped review-reply results without adding reply content to the ledger. */
export const productionReviewReplyIdempotencyMigration: DatabaseMigration = {
  version: '049',
  name: 'production_review_reply_idempotency',
  checksum: '049-production-review-reply-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS production_review_reply_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        production_id INTEGER NOT NULL,
        thread_id INTEGER NOT NULL,
        reply_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_production_review_reply_actor_scope
      ON production_review_reply_request_keys(actor_id, production_id, thread_id)
    `);

    const columns = await executor.execute('PRAGMA table_info(production_review_reply_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'production_id', 'thread_id', 'reply_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('PRODUCTION_REVIEW_REPLY_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('PRODUCTION_REVIEW_REPLY_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
