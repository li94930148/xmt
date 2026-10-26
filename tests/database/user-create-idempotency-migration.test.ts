import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createClient } from '@libsql/client';
import { userCreateIdempotencyMigration } from '../../api/database/migrations/040_user_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-user-create-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  )`);
  await client.execute({ sql: 'INSERT INTO users(username,role) VALUES(?,?)', args: ['existing-user', 'member'] });

  await userCreateIdempotencyMigration.up(client);
  await userCreateIdempotencyMigration.up(client);
  const legacy = await client.execute('SELECT id,username,role FROM users WHERE id=1');
  assert.deepEqual(legacy.rows[0], { id: 1, username: 'existing-user', role: 'member' }, 'the additive migration preserves existing accounts');

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a52';
  await client.execute({
    sql: `INSERT INTO user_create_request_keys(client_request_id,actor_id,target_user_id,request_fingerprint)
      VALUES(?,?,?,?)`,
    args: [requestId, 7, 9, 'opaque-fingerprint'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO user_create_request_keys(client_request_id,actor_id,target_user_id,request_fingerprint)
      VALUES(?,?,?,?)`,
    args: [requestId, 7, 10, 'different-payload'],
  }), /UNIQUE constraint failed/i, 'request keys cannot be rebound to another create');
  await client.execute('DELETE FROM users WHERE id=1');
  const tombstone = await client.execute(
    'SELECT actor_id,target_user_id,request_fingerprint FROM user_create_request_keys WHERE client_request_id=?',
    [requestId],
  );
  assert.deepEqual(tombstone.rows[0], { actor_id: 7, target_user_id: 9, request_fingerprint: 'opaque-fingerprint' }, 'request history survives target deletion');
  console.log('user create idempotency migration test passed');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
