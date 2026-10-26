import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { anonymousFeedbackDeleteIdempotencyMigration } from '../../api/database/migrations/046_anonymous_feedback_delete_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-anonymous-feedback-delete-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'anonymous-feedback.db')}` });

try {
  await client.execute(`CREATE TABLE anonymous_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL
  )`);
  await client.execute({ sql: 'INSERT INTO anonymous_feedback(content) VALUES(?)', args: ['existing feedback'] });

  await anonymousFeedbackDeleteIdempotencyMigration.up(client);
  await anonymousFeedbackDeleteIdempotencyMigration.up(client);

  assert.deepEqual((await client.execute('SELECT id,content FROM anonymous_feedback WHERE id=1')).rows[0], {
    id: 1,
    content: 'existing feedback',
  }, 'the additive migration preserves existing feedback');
  const columns = await client.execute('PRAGMA table_info(anonymous_feedback_delete_request_keys)');
  assert.deepEqual(columns.rows.map((column) => String(column.name)), [
    'client_request_id', 'actor_id', 'target_feedback_id', 'created_at',
  ]);
  assert.equal(columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name)).join(','), 'client_request_id');

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a56';
  await client.execute({
    sql: `INSERT INTO anonymous_feedback_delete_request_keys(client_request_id,actor_id,target_feedback_id)
      VALUES(?,?,?)`,
    args: [requestId, 7, 9],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO anonymous_feedback_delete_request_keys(client_request_id,actor_id,target_feedback_id)
      VALUES(?,?,?)`,
    args: [requestId, 8, 9],
  }), /UNIQUE constraint failed/i, 'a request ID cannot be rebound across actors');

  await client.execute('DELETE FROM anonymous_feedback WHERE id=1');
  assert.deepEqual((await client.execute(
    'SELECT actor_id,target_feedback_id FROM anonymous_feedback_delete_request_keys WHERE client_request_id=?',
    [requestId],
  )).rows[0], {
    actor_id: 7,
    target_feedback_id: 9,
  }, 'the tombstone survives physical deletion of feedback');
  console.log('Anonymous-feedback delete idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
