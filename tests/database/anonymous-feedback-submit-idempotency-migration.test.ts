import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { anonymousFeedbackSubmitIdempotencyMigration } from '../../api/database/migrations/066_anonymous_feedback_submit_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-anonymous-feedback-submit-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'anonymous-feedback.db')}` });

try {
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute(`CREATE TABLE anonymous_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL
  )`);
  await client.execute({ sql: 'INSERT INTO anonymous_feedback(content) VALUES(?)', args: ['existing feedback'] });

  await anonymousFeedbackSubmitIdempotencyMigration.up(client);
  await anonymousFeedbackSubmitIdempotencyMigration.up(client);

  assert.deepEqual((await client.execute('SELECT id,content FROM anonymous_feedback WHERE id=1')).rows[0], {
    id: 1,
    content: 'existing feedback',
  }, 'the additive migration preserves existing feedback');
  const columns = await client.execute('PRAGMA table_info(anonymous_feedback_submission_request_keys)');
  assert.deepEqual(columns.rows.map((column) => String(column.name)), [
    'client_request_id', 'target_feedback_id', 'request_fingerprint', 'created_at',
  ]);
  assert.equal(columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name)).join(','), 'client_request_id');
  assert.equal(columns.rows.some((column) => String(column.name).includes('actor') || String(column.name).includes('user')), false,
    'submission receipts do not retain submitter identity');

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a61';
  await client.execute({
    sql: `INSERT INTO anonymous_feedback_submission_request_keys
      (client_request_id,target_feedback_id,request_fingerprint) VALUES(?,?,?)`,
    args: [requestId, 1, 'a'.repeat(64)],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO anonymous_feedback_submission_request_keys
      (client_request_id,target_feedback_id,request_fingerprint) VALUES(?,?,?)`,
    args: [requestId, 1, 'b'.repeat(64)],
  }), /UNIQUE constraint failed/i, 'a request ID cannot be rebound');
  await client.execute('DELETE FROM anonymous_feedback WHERE id=1');
  assert.equal((await client.execute(
    'SELECT client_request_id FROM anonymous_feedback_submission_request_keys WHERE client_request_id=?',
    [requestId],
  )).rows.length, 0, 'deleting feedback clears the permanent submission receipt');

  console.log('Anonymous-feedback submit idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
