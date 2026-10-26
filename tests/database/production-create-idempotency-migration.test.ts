import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { productionCreateIdempotencyMigration } from '../../api/database/migrations/037_production_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-create-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute('CREATE TABLE production (id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER NOT NULL)');
  await client.execute('INSERT INTO production (topic_id) VALUES (11)');

  await productionCreateIdempotencyMigration.up(client);
  await productionCreateIdempotencyMigration.up(client);
  assert.deepEqual((await client.execute('SELECT id,topic_id FROM production WHERE id=1')).rows[0], { id: 1, topic_id: 11 });

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await client.execute({
    sql: `INSERT INTO production_create_request_keys(client_request_id,creator_id,production_id,request_fingerprint)
      VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO production_create_request_keys(client_request_id,creator_id,production_id,request_fingerprint)
      VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'different-payload'],
  }), /UNIQUE constraint failed/i);
  await client.execute('DELETE FROM production WHERE id=1');
  assert.deepEqual((await client.execute(
    'SELECT production_id,creator_id,request_fingerprint FROM production_create_request_keys WHERE client_request_id=?',
    [requestId],
  )).rows[0], { production_id: 1, creator_id: 7, request_fingerprint: 'same-payload' },
  'replay tombstones survive record deletion and prevent an accidental replacement create');
  console.log('Production create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
