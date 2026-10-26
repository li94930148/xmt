import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { inspirationVoteIdempotencyMigration } from '../../api/database/migrations/054_inspiration_vote_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-inspiration-vote-idempotency-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE inspirations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    creator_id INTEGER,
    votes INTEGER NOT NULL DEFAULT 0
  )`);
  await client.execute({
    sql: 'INSERT INTO inspirations (title, creator_id, votes) VALUES (?, ?, ?)',
    args: ['既有灵感', 7, 2],
  });

  await inspirationVoteIdempotencyMigration.up(client);
  await inspirationVoteIdempotencyMigration.up(client);
  const legacy = await client.execute('SELECT id, title, votes FROM inspirations WHERE id = 1');
  assert.deepEqual(legacy.rows[0], { id: 1, title: '既有灵感', votes: 2 }, 'the additive migration does not rewrite existing inspiration or vote counts');

  const columns = await client.execute('PRAGMA table_info(inspiration_vote_request_keys)');
  const names = new Set(columns.rows.map((column) => String(column.name)));
  assert.deepEqual(
    ['client_request_id', 'user_id', 'inspiration_id', 'requested_voted', 'result_voted', 'created_at'].filter((name) => !names.has(name)),
    [],
  );
  const primaryKey = columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name));
  assert.deepEqual(primaryKey, ['client_request_id']);
  const schema = await client.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inspiration_vote_request_keys'");
  assert.match(String(schema.rows[0]?.sql), /result_voted\s*=\s*requested_voted/i, 'the ledger rejects contradictory requested and processed states');

  const requestId = 'd11a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await client.execute({
    sql: `INSERT INTO inspiration_vote_request_keys
      (client_request_id, user_id, inspiration_id, requested_voted, result_voted)
      VALUES (?, ?, ?, ?, ?)`,
    args: [requestId, 7, 1, 1, 1],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO inspiration_vote_request_keys
      (client_request_id, user_id, inspiration_id, requested_voted, result_voted)
      VALUES (?, ?, ?, ?, ?)`,
    args: [requestId, 7, 1, 0, 0],
  }), /UNIQUE constraint failed/i, 'a request id is globally unique and cannot be reused for a different desired state');
  await assert.rejects(client.execute({
    sql: `INSERT INTO inspiration_vote_request_keys
      (client_request_id, user_id, inspiration_id, requested_voted, result_voted)
      VALUES (?, ?, ?, ?, ?)`,
    args: ['d21a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50', 7, 1, 1, 0],
  }), /CHECK constraint failed/i, 'a receipt cannot claim a processed state different from its requested target');

  await client.execute('DELETE FROM inspirations WHERE id = 1');
  const retained = await client.execute(
    'SELECT user_id, inspiration_id, requested_voted, result_voted FROM inspiration_vote_request_keys WHERE client_request_id = ?',
    [requestId],
  );
  assert.deepEqual(retained.rows[0], { user_id: 7, inspiration_id: 1, requested_voted: 1, result_voted: 1 }, 'the replay tombstone survives inspiration deletion');

  const malformedClient = createClient({ url: `file:${path.join(directory, 'malformed.db')}` });
  try {
    await malformedClient.execute(`CREATE TABLE inspiration_vote_request_keys (
      client_request_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      inspiration_id INTEGER NOT NULL,
      requested_voted INTEGER NOT NULL,
      result_voted INTEGER NOT NULL,
      created_at DATETIME NOT NULL
    )`);
    await assert.rejects(
      inspirationVoteIdempotencyMigration.up(malformedClient),
      /INSPIRATION_VOTE_REQUEST_KEY_RESULT_CONSTRAINT_INVALID/,
      'an incomplete pre-existing table is rejected instead of being silently accepted',
    );
  } finally {
    malformedClient.close();
  }
  console.log('Inspiration vote idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
