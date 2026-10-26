import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { anonymousFeedbackUpdateIdempotencyMigration } from '../../api/database/migrations/063_anonymous_feedback_update_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-anonymous-feedback-update-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'anonymous-feedback.db')}` });

try {
  await client.execute(`CREATE TABLE anonymous_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL
  )`);
  await client.execute({ sql: 'INSERT INTO anonymous_feedback(content) VALUES(?)', args: ['existing feedback'] });

  await anonymousFeedbackUpdateIdempotencyMigration.up(client);
  await anonymousFeedbackUpdateIdempotencyMigration.up(client);

  assert.deepEqual((await client.execute('SELECT id,content FROM anonymous_feedback WHERE id=1')).rows[0], {
    id: 1,
    content: 'existing feedback',
  }, 'the additive migration preserves existing feedback');
  const columns = await client.execute('PRAGMA table_info(anonymous_feedback_update_request_keys)');
  assert.deepEqual(columns.rows.map((column) => String(column.name)), [
    'client_request_id', 'actor_id', 'target_feedback_id', 'request_fingerprint', 'base_fingerprint', 'created_at',
  ]);
  assert.equal(columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name)).join(','), 'client_request_id');

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57';
  await client.execute({
    sql: `INSERT INTO anonymous_feedback_update_request_keys
      (client_request_id,actor_id,target_feedback_id,request_fingerprint,base_fingerprint)
      VALUES(?,?,?,?,?)`,
    args: [requestId, 7, 9, 'a'.repeat(64), 'b'.repeat(64)],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO anonymous_feedback_update_request_keys
      (client_request_id,actor_id,target_feedback_id,request_fingerprint,base_fingerprint)
      VALUES(?,?,?,?,?)`,
    args: [requestId, 8, 9, 'a'.repeat(64), 'b'.repeat(64)],
  }), /UNIQUE constraint failed/i, 'a request ID cannot be rebound across actors');
  assert.deepEqual((await client.execute(
    `SELECT actor_id,target_feedback_id,request_fingerprint,base_fingerprint
     FROM anonymous_feedback_update_request_keys WHERE client_request_id=?`,
    [requestId],
  )).rows[0], {
    actor_id: 7,
    target_feedback_id: 9,
    request_fingerprint: 'a'.repeat(64),
    base_fingerprint: 'b'.repeat(64),
  }, 'the recovery receipt preserves actor, target, and fingerprint binding');

  console.log('Anonymous-feedback update idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
