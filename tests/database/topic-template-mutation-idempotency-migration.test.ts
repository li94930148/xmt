import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { topicTemplateMutationIdempotencyMigration } from '../../api/database/migrations/064_topic_template_mutation_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-topic-template-mutation-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'templates.db')}` });

try {
  await client.execute(`CREATE TABLE topic_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    platform TEXT,
    description TEXT,
    template_data TEXT,
    creator_id INTEGER,
    is_default BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.execute({ sql: 'INSERT INTO topic_templates(name,template_data) VALUES(?,?)', args: ['existing topic template', 'preserve me'] });

  await topicTemplateMutationIdempotencyMigration.up(client);
  await topicTemplateMutationIdempotencyMigration.up(client);

  assert.deepEqual((await client.execute('SELECT id,name,template_data FROM topic_templates WHERE id=1')).rows[0], {
    id: 1,
    name: 'existing topic template',
    template_data: 'preserve me',
  }, 'the additive migration preserves existing templates');
  const columns = await client.execute('PRAGMA table_info(topic_template_mutation_request_keys)');
  assert.deepEqual(columns.rows.map((column) => String(column.name)), [
    'client_request_id', 'actor_id', 'operation', 'target_template_id', 'request_fingerprint', 'base_fingerprint', 'created_at',
  ]);
  assert.equal(columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name)).join(','), 'client_request_id');

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a65';
  await client.execute({
    sql: `INSERT INTO topic_template_mutation_request_keys
      (client_request_id,actor_id,operation,target_template_id,request_fingerprint)
      VALUES(?,?,?,?,?)`,
    args: [requestId, 7, 'delete', 9, 'a'.repeat(64)],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO topic_template_mutation_request_keys
      (client_request_id,actor_id,operation,target_template_id,request_fingerprint)
      VALUES(?,?,?,?,?)`,
    args: [requestId, 8, 'delete', 9, 'a'.repeat(64)],
  }), /UNIQUE constraint failed/i, 'a request ID cannot be rebound across actors');
  assert.deepEqual((await client.execute(
    `SELECT actor_id,operation,target_template_id,request_fingerprint
     FROM topic_template_mutation_request_keys WHERE client_request_id=?`,
    [requestId],
  )).rows[0], {
    actor_id: 7,
    operation: 'delete',
    target_template_id: 9,
    request_fingerprint: 'a'.repeat(64),
  }, 'the receipt retains a delete tombstone after its target row is gone');

  await assert.rejects(client.execute({
    sql: `INSERT INTO topic_template_mutation_request_keys
      (client_request_id,actor_id,operation,target_template_id,request_fingerprint)
      VALUES(?,?,?,?,?)`,
    args: ['b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a66', 7, 'other', 10, 'b'.repeat(64)],
  }), /CHECK constraint failed/i, 'only supported mutation operations can be recorded');

  console.log('Topic-template mutation idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
