import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { workflowTemplateUpdateIdempotencyMigration } from '../../api/database/migrations/061_workflow_template_update_idempotency.js';
import { migrationPolicies } from '../../api/database/migrations/policy.js';
import { assessMigrationReadiness } from '../../api/modules/ops/migration-readiness-decision.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-template-update-idempotency-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'workflow-templates.db')}` });

try {
  assert.equal(migrationPolicies['061'], 'SAFE_EXPAND');
  assert.equal(assessMigrationReadiness([workflowTemplateUpdateIdempotencyMigration], migrationPolicies, []).decision, 'GO');
  await client.execute(`CREATE TABLE workflow_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT
  )`);
  await client.execute("INSERT INTO workflow_templates(name,description) VALUES('既有审批流','保留说明')");

  await workflowTemplateUpdateIdempotencyMigration.up(client);
  await workflowTemplateUpdateIdempotencyMigration.up(client);

  assert.deepEqual(
    (await client.execute('SELECT id,name,description FROM workflow_templates WHERE id=1')).rows[0],
    { id: 1, name: '既有审批流', description: '保留说明' },
    'the additive migration leaves existing template data untouched',
  );
  const columns = await client.execute('PRAGMA table_info(workflow_template_update_request_keys)');
  const columnNames = new Set(columns.rows.map((column) => String(column.name)));
  assert.deepEqual([...columnNames].sort(), [
    'actor_id', 'client_request_id', 'created_at', 'request_fingerprint', 'template_id',
  ]);
  assert.equal(columns.rows.find((column) => String(column.name) === 'client_request_id')?.pk, 1,
    'request IDs are globally unique across actors, templates, and payloads');

  const requestId = '8c5613f9-6d04-48d2-a11a-c54cb10b91f1';
  await client.execute({
    sql: `INSERT INTO workflow_template_update_request_keys
      (client_request_id,actor_id,template_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO workflow_template_update_request_keys
      (client_request_id,actor_id,template_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 8, 1, 'other-payload'],
  }), /UNIQUE constraint failed/i);
  console.log('Workflow-template update idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
