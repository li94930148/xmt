import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createClient } from '@libsql/client';
import { publishingCreateIdempotencyMigration } from '../../api/database/migrations/035_publishing_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-publishing-create-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE publishing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    platform TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
  )`);
  await client.execute({
    sql: 'INSERT INTO publishing (topic_id,platform,status) VALUES (?,?,?)',
    args: [11, '历史平台', 'published'],
  });

  await publishingCreateIdempotencyMigration.up(client);
  await publishingCreateIdempotencyMigration.up(client);
  const legacy = await client.execute('SELECT id,topic_id,platform,status FROM publishing WHERE id=1');
  assert.deepEqual(legacy.rows[0], { id: 1, topic_id: 11, platform: '历史平台', status: 'published' });

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await client.execute({
    sql: 'INSERT INTO publishing (topic_id,platform,status) VALUES (?,?,?)',
    args: [12, '新平台', 'pending'],
  });
  await client.execute({
    sql: `INSERT INTO publishing_create_request_keys (client_request_id,creator_id,publishing_id,request_fingerprint)
      VALUES (?,?,?,?)`,
    args: [requestId, 7, 2, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO publishing_create_request_keys (client_request_id,creator_id,publishing_id,request_fingerprint)
      VALUES (?,?,?,?)`,
    args: [requestId, 7, 2, 'different-payload'],
  }), /UNIQUE constraint failed/i);
  await client.execute('DELETE FROM publishing WHERE id=2');
  const tombstone = await client.execute(
    'SELECT publishing_id,creator_id,request_fingerprint FROM publishing_create_request_keys WHERE client_request_id=?',
    [requestId],
  );
  assert.deepEqual(tombstone.rows[0], { publishing_id: 2, creator_id: 7, request_fingerprint: 'same-payload' },
    'the expansion migration has no destructive cascade and preserves replay tombstones');
  console.log('Publishing create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
