import type { DatabaseMigration } from './types';

/** Persist retrospective create request keys separately from retrospective rows. */
export const retrospectiveCreateIdempotencyMigration: DatabaseMigration = {
  version: '043',
  name: 'retrospective_create_idempotency',
  checksum: '043-retrospective-create-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS retrospective_create_request_keys (
        client_request_id TEXT PRIMARY KEY,
        actor_id INTEGER NOT NULL,
        retrospective_id INTEGER NOT NULL,
        request_fingerprint TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(retrospective_create_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    if (!['client_request_id', 'actor_id', 'retrospective_id', 'request_fingerprint', 'created_at'].every((name) => columnNames.has(name))) {
      throw new Error('RETROSPECTIVE_CREATE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('RETROSPECTIVE_CREATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }
  },
};
