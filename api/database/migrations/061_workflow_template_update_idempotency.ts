import type { DatabaseMigration } from './types';

/** Persist actor-scoped replay receipts for workflow-template updates. */
export const workflowTemplateUpdateIdempotencyMigration: DatabaseMigration = {
  version: '061',
  name: 'workflow_template_update_idempotency',
  checksum: '061-workflow-template-update-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS workflow_template_update_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        template_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_workflow_template_update_actor_template
      ON workflow_template_update_request_keys(actor_id, template_id)
    `);

    const columns = await executor.execute('PRAGMA table_info(workflow_template_update_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'template_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('WORKFLOW_TEMPLATE_UPDATE_REQUEST_KEY_SCHEMA_INVALID');
    }
    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('WORKFLOW_TEMPLATE_UPDATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
