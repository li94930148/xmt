import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createClient } from '@libsql/client';
import { shootingCreateIdempotencyMigration } from '../../api/database/migrations/036_shooting_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-shooting-create-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute('CREATE TABLE shooting (id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER NOT NULL)');
  await client.execute('INSERT INTO shooting (topic_id) VALUES (11)');

  await shootingCreateIdempotencyMigration.up(client);
  await shootingCreateIdempotencyMigration.up(client);
  assert.deepEqual((await client.execute('SELECT id,topic_id FROM shooting WHERE id=1')).rows[0], { id: 1, topic_id: 11 });

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await client.execute({
    sql: `INSERT INTO shooting_create_request_keys (client_request_id,creator_id,shooting_id,request_fingerprint)
      VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO shooting_create_request_keys (client_request_id,creator_id,shooting_id,request_fingerprint)
      VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'different-payload'],
  }), /UNIQUE constraint failed/i);
  await client.execute('DELETE FROM shooting WHERE id=1');
  assert.deepEqual((await client.execute(
    'SELECT shooting_id,creator_id,request_fingerprint FROM shooting_create_request_keys WHERE client_request_id=?',
    [requestId],
  )).rows[0], { shooting_id: 1, creator_id: 7, request_fingerprint: 'same-payload' },
  'replay tombstones survive record deletion and never authorize an accidental replacement create');
  console.log('Shooting create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
