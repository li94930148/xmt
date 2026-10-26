import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { resourceCategoryMutationIdempotencyMigration } from '../../api/database/migrations/062_resource_category_mutation_idempotency.js';
import { migrationPolicies } from '../../api/database/migrations/policy.js';
import { assessMigrationReadiness } from '../../api/modules/ops/migration-readiness-decision.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-category-mutation-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'resource-category.db')}` });

try {
  assert.equal(migrationPolicies['062'], 'SAFE_EXPAND', 'legacy category CRUD remains compatible without receipts');
  assert.equal(assessMigrationReadiness([resourceCategoryMutationIdempotencyMigration], migrationPolicies, []).decision, 'GO');
  await client.execute(`CREATE TABLE resource_categories (id INTEGER PRIMARY KEY, library_type TEXT NOT NULL, name TEXT NOT NULL)`);
  await client.execute("INSERT INTO resource_categories(id,library_type,name) VALUES(1,'knowledge','既有分类')");
  await resourceCategoryMutationIdempotencyMigration.up(client);
  await resourceCategoryMutationIdempotencyMigration.up(client);

  assert.deepEqual((await client.execute('SELECT id,library_type,name FROM resource_categories WHERE id=1')).rows[0], {
    id: 1, library_type: 'knowledge', name: '既有分类',
  }, 'the additive migration preserves existing categories');
  const columns = await client.execute('PRAGMA table_info(resource_category_mutation_request_keys)');
  assert.deepEqual(
    columns.rows.map((column) => String(column.name)).sort(),
    ['actor_id', 'client_request_id', 'created_at', 'library_type', 'operation', 'request_fingerprint', 'result_category_id', 'target_category_id'],
  );
  assert.equal(columns.rows.find((column) => String(column.name) === 'client_request_id')?.pk, 1, 'request IDs are globally unique');
  const key = 'f1c7f8a0-2b87-4782-a117-d81ed4c08d29';
  await client.execute({
    sql: `INSERT INTO resource_category_mutation_request_keys
      (client_request_id,actor_id,operation,library_type,target_category_id,result_category_id,request_fingerprint)
      VALUES(?,?,'create','knowledge',NULL,1,?)`,
    args: [key, 9, 'fingerprint'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO resource_category_mutation_request_keys
      (client_request_id,actor_id,operation,library_type,target_category_id,result_category_id,request_fingerprint)
      VALUES(?,?,'create','knowledge',NULL,2,?)`,
    args: [key, 9, 'different'],
  }), /UNIQUE constraint failed/i, 'a request ID cannot be reused for another target or payload');
  console.log('Resource category mutation migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
