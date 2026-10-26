import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { resourceCreateIdempotencyMigration } from '../../api/database/migrations/059_resource_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-create-idempotency-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'resources.db')}` });

try {
  await client.execute('CREATE TABLE resources (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)');
  await client.execute("INSERT INTO resources(title) VALUES('既有资料')");

  await resourceCreateIdempotencyMigration.up(client);
  await resourceCreateIdempotencyMigration.up(client);

  assert.deepEqual(
    (await client.execute('SELECT id,title FROM resources WHERE id=1')).rows[0],
    { id: 1, title: '既有资料' },
    'the additive migration preserves existing resources',
  );

  const columns = await client.execute('PRAGMA table_info(resource_create_request_keys)');
  const columnNames = new Set(columns.rows.map((column) => String(column.name)));
  assert.deepEqual(
    [...columnNames].sort(),
    ['actor_id', 'client_request_id', 'created_at', 'request_fingerprint', 'resource_id'],
  );
  assert.equal(
    columns.rows.find((column) => String(column.name) === 'client_request_id')?.pk,
    1,
    'request IDs are globally unique so another actor cannot claim an existing key',
  );

  const requestId = '61e33e45-2db0-4e0e-87f3-84a84d2b2041';
  await client.execute({
    sql: `INSERT INTO resource_create_request_keys
      (client_request_id,actor_id,resource_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO resource_create_request_keys
      (client_request_id,actor_id,resource_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 8, 1, 'different-payload'],
  }), /UNIQUE constraint failed/i, 'a receipt key cannot be claimed by a second actor');

  console.log('Resource create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
