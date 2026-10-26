import type { DatabaseMigration } from './types';

/** Persist an actor-scoped result key for retrospective action creates. */
export const retroActionCreateIdempotencyMigration: DatabaseMigration = {
  version: '047',
  name: 'retro_action_create_idempotency',
  checksum: '047-retro-action-create-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS retro_action_create_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        retro_id INTEGER NOT NULL,
        action_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_retro_action_create_actor_retro
      ON retro_action_create_request_keys(actor_id, retro_id)
    `);

    const columns = await executor.execute('PRAGMA table_info(retro_action_create_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'retro_id', 'action_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('RETRO_ACTION_CREATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('RETRO_ACTION_CREATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
