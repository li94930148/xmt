import type { DatabaseMigration } from './types';

/** Keep anonymous submission receipts until the associated feedback is deleted. */
export const anonymousFeedbackSubmitIdempotencyMigration: DatabaseMigration = {
  version: '066',
  name: 'anonymous_feedback_submit_idempotency',
  checksum: '066-anonymous-feedback-submit-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS anonymous_feedback_submission_request_keys (
        client_request_id TEXT PRIMARY KEY,
        target_feedback_id INTEGER NOT NULL REFERENCES anonymous_feedback(id) ON DELETE CASCADE,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_anonymous_feedback_submission_target
      ON anonymous_feedback_submission_request_keys(target_feedback_id, created_at)
    `);

    const columns = await executor.execute('PRAGMA table_info(anonymous_feedback_submission_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'target_feedback_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('ANONYMOUS_FEEDBACK_SUBMISSION_REQUEST_KEY_SCHEMA_INVALID');
    }
    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('ANONYMOUS_FEEDBACK_SUBMISSION_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
    const foreignKeys = await executor.execute('PRAGMA foreign_key_list(anonymous_feedback_submission_request_keys)');
    if (!foreignKeys.rows.some((row) => String(row.table) === 'anonymous_feedback'
      && String(row.from) === 'target_feedback_id'
      && String(row.to) === 'id'
      && String(row.on_delete).toUpperCase() === 'CASCADE')) {
      throw new Error('ANONYMOUS_FEEDBACK_SUBMISSION_REQUEST_KEY_DELETE_CASCADE_INVALID');
    }
  },
};
