import type { DatabaseMigration } from './types';

/** Persist actor and action scoped receipts for retrospective action updates. */
export const retroActionUpdateIdempotencyMigration: DatabaseMigration = {
  version: '055',
  name: 'retro_action_update_idempotency',
  checksum: '055-retro-action-update-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS retro_action_update_request_keys (
        actor_id INTEGER NOT NULL,
        action_id INTEGER NOT NULL,
        client_request_id TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (actor_id, action_id, client_request_id)
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(retro_action_update_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    const requiredColumns = ['actor_id', 'action_id', 'client_request_id', 'request_fingerprint', 'created_at'];
    if (!requiredColumns.every((name) => columnNames.has(name))) {
      throw new Error('RETRO_ACTION_UPDATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows
      .filter((column) => Number(column.pk) > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk))
      .map((column) => String(column.name));
    if (primaryKey.join(',') !== 'actor_id,action_id,client_request_id') {
      throw new Error('RETRO_ACTION_UPDATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
