import type { DatabaseMigration } from './types';

/** Store actor-scoped receipts for anonymous-feedback status, visibility, and reply updates. */
export const anonymousFeedbackUpdateIdempotencyMigration: DatabaseMigration = {
  version: '063',
  name: 'anonymous_feedback_update_idempotency',
  checksum: '063-anonymous-feedback-update-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS anonymous_feedback_update_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        target_feedback_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        base_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_anonymous_feedback_update_actor_target
      ON anonymous_feedback_update_request_keys(actor_id, target_feedback_id, created_at)
    `);

    const columns = await executor.execute('PRAGMA table_info(anonymous_feedback_update_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (![
      'client_request_id', 'actor_id', 'target_feedback_id', 'request_fingerprint', 'base_fingerprint', 'created_at',
    ].every((name) => columnNames.has(name))) {
      throw new Error('ANONYMOUS_FEEDBACK_UPDATE_REQUEST_KEY_SCHEMA_INVALID');
    }
    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('ANONYMOUS_FEEDBACK_UPDATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
