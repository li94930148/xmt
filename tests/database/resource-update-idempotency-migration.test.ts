import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { resourceUpdateIdempotencyMigration } from '../../api/database/migrations/060_resource_update_idempotency.js';
import { migrationPolicies } from '../../api/database/migrations/policy.js';
import { assessMigrationReadiness } from '../../api/modules/ops/migration-readiness-decision.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-update-idempotency-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'resources.db')}` });

try {
  assert.equal(migrationPolicies['060'], 'SAFE_EXPAND', 'the migration remains compatible with old clients that do not write receipts');
  assert.equal(assessMigrationReadiness([resourceUpdateIdempotencyMigration], migrationPolicies, []).decision, 'GO');

  await client.execute('CREATE TABLE resources (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)');
  await client.execute("INSERT INTO resources(title) VALUES('既有资料')");

  await resourceUpdateIdempotencyMigration.up(client);
  await resourceUpdateIdempotencyMigration.up(client);

  assert.deepEqual(
    (await client.execute('SELECT id,title FROM resources WHERE id=1')).rows[0],
    { id: 1, title: '既有资料' },
    'the additive migration preserves existing resources',
  );

  const columns = await client.execute('PRAGMA table_info(resource_update_request_keys)');
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

  const requestId = 'd350f580-7877-492f-9b70-a3f8e1ca9f01';
  await client.execute({
    sql: `INSERT INTO resource_update_request_keys
      (client_request_id,actor_id,resource_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO resource_update_request_keys
      (client_request_id,actor_id,resource_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 8, 1, 'different-payload'],
  }), /UNIQUE constraint failed/i, 'a receipt key cannot be claimed by a second actor');

  console.log('Resource update idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
