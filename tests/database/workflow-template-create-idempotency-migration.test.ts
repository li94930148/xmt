import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { workflowTemplateCreateIdempotencyMigration } from '../../api/database/migrations/045_workflow_template_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-template-create-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'workflow-templates.db')}` });

try {
  await client.execute(`CREATE TABLE workflow_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);
  await client.execute(`INSERT INTO workflow_templates(name) VALUES('历史审批流')`);

  await workflowTemplateCreateIdempotencyMigration.up(client);
  await workflowTemplateCreateIdempotencyMigration.up(client);

  assert.deepEqual((await client.execute('SELECT id,name FROM workflow_templates WHERE id=1')).rows[0], {
    id: 1,
    name: '历史审批流',
  }, 'the additive migration leaves existing workflow templates unchanged');

  const columns = await client.execute('PRAGMA table_info(workflow_template_create_request_keys)');
  assert.deepEqual(columns.rows.map((column) => String(column.name)), [
    'client_request_id', 'actor_id', 'template_id', 'request_fingerprint', 'created_at',
  ]);
  assert.equal(columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name)).join(','), 'client_request_id');

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a55';
  await client.execute({
    sql: `INSERT INTO workflow_template_create_request_keys(client_request_id,actor_id,template_id,request_fingerprint)
      VALUES(?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO workflow_template_create_request_keys(client_request_id,actor_id,template_id,request_fingerprint)
      VALUES(?,?,?,?)`,
    args: [requestId, 7, 1, 'different-payload'],
  }), /UNIQUE constraint failed/i, 'one request ID stores exactly one template-create outcome');

  await client.execute('DELETE FROM workflow_templates WHERE id=1');
  assert.deepEqual((await client.execute(
    'SELECT actor_id,template_id,request_fingerprint FROM workflow_template_create_request_keys WHERE client_request_id=?',
    [requestId],
  )).rows[0], {
    actor_id: 7,
    template_id: 1,
    request_fingerprint: 'same-payload',
  }, 'request tombstones survive template deletion');

  console.log('Workflow-template create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
