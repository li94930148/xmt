import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { retrospectiveCreateIdempotencyMigration } from '../../api/database/migrations/043_retrospective_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retro-create-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'retrospective.db')}` });

try {
  await client.execute(`CREATE TABLE retrospectives (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)`);
  await client.execute(`INSERT INTO retrospectives (title) VALUES ('历史复盘')`);
  await retrospectiveCreateIdempotencyMigration.up(client);
  await retrospectiveCreateIdempotencyMigration.up(client);
  assert.deepEqual(
    (await client.execute('SELECT id,title FROM retrospectives WHERE id=1')).rows[0],
    { id: 1, title: '历史复盘' },
    'migration preserves existing retrospective rows',
  );

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await client.execute({
    sql: `INSERT INTO retrospective_create_request_keys
      (client_request_id,actor_id,retrospective_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO retrospective_create_request_keys
      (client_request_id,actor_id,retrospective_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 8, 1, 'different-payload'],
  }), /UNIQUE constraint failed/i, 'request key is globally unique across actors');
  console.log('Retrospective create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
