import type { DatabaseMigration } from './types';

/** Persist actor and retrospective scoped outcomes for summary/title updates. */
export const retrospectiveUpdateIdempotencyMigration: DatabaseMigration = {
  version: '057',
  name: 'retrospective_update_idempotency',
  checksum: '057-retrospective-update-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS retrospective_update_request_keys (
        actor_id INTEGER NOT NULL,
        retrospective_id INTEGER NOT NULL,
        client_request_id TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        outcome TEXT NOT NULL DEFAULT 'processed' CHECK (outcome IN ('processed', 'conflict')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (actor_id, retrospective_id, client_request_id)
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(retrospective_update_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    const requiredColumns = ['actor_id', 'retrospective_id', 'client_request_id', 'request_fingerprint', 'outcome', 'created_at'];
    if (!requiredColumns.every((name) => columnNames.has(name))) {
      throw new Error('RETROSPECTIVE_UPDATE_REQUEST_KEY_SCHEMA_INVALID');
    }
    const outcomeColumn = columns.rows.find((column) => String(column.name) === 'outcome');
    if (!outcomeColumn
      || Number(outcomeColumn.notnull) !== 1
      || String(outcomeColumn.dflt_value).replace(/'/g, '') !== 'processed') {
      throw new Error('RETROSPECTIVE_UPDATE_OUTCOME_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows
      .filter((column) => Number(column.pk) > 0)
      .sort((left, right) => Number(left.pk) - Number(right.pk))
      .map((column) => String(column.name));
    if (primaryKey.join(',') !== 'actor_id,retrospective_id,client_request_id') {
      throw new Error('RETROSPECTIVE_UPDATE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }

    const schema = await executor.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='retrospective_update_request_keys'",
    );
    const schemaSql = String(schema.rows[0]?.sql || '').replace(/\s+/g, ' ').toLowerCase();
    if (!schemaSql.includes("check (outcome in ('processed', 'conflict'))")) {
      throw new Error('RETROSPECTIVE_UPDATE_OUTCOME_CHECK_INVALID');
    }
  },
};
