import type { DatabaseMigration } from './types';

/** Keep keyed inspiration vote outcomes so a lost response can be safely verified or replayed. */
export const inspirationVoteIdempotencyMigration: DatabaseMigration = {
  version: '054',
  name: 'inspiration_vote_idempotency',
  checksum: '054-inspiration-vote-idempotency-v1',
  async up(executor) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS inspiration_vote_request_keys (
        client_request_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        inspiration_id INTEGER NOT NULL,
        requested_voted INTEGER NOT NULL CHECK (requested_voted IN (0, 1)),
        result_voted INTEGER NOT NULL CHECK (result_voted IN (0, 1) AND result_voted = requested_voted),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const columns = await executor.execute('PRAGMA table_info(inspiration_vote_request_keys)');
    const columnNames = new Set(columns.rows.map((column) => String(column.name)));
    const requiredColumns = [
      'client_request_id', 'user_id', 'inspiration_id', 'requested_voted', 'result_voted', 'created_at',
    ];
    if (!requiredColumns.every((name) => columnNames.has(name))) {
      throw new Error('INSPIRATION_VOTE_REQUEST_KEY_SCHEMA_INVALID');
    }

    const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
    if (primaryKey.join(',') !== 'client_request_id') {
      throw new Error('INSPIRATION_VOTE_REQUEST_KEY_PRIMARY_KEY_INVALID');
    }

    const schema = await executor.execute(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inspiration_vote_request_keys'`,
    );
    const createSql = String(schema.rows[0]?.sql ?? '').replace(/\s+/g, ' ');
    if (!/CHECK\s*\(\s*result_voted\s+IN\s*\(\s*0\s*,\s*1\s*\)\s+AND\s+result_voted\s*=\s*requested_voted\s*\)/i.test(createSql)) {
      throw new Error('INSPIRATION_VOTE_REQUEST_KEY_RESULT_CONSTRAINT_INVALID');
    }
  },
};
