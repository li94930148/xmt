import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { workflowScriptSourceMigration } from '../../api/database/migrations/026_workflow_script_source.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-script-source-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE shooting (id INTEGER PRIMARY KEY, script_content TEXT)`);
  await client.execute(`CREATE TABLE publishing (id INTEGER PRIMARY KEY, script_content TEXT)`);
  await client.execute(`INSERT INTO shooting (id, script_content) VALUES (1, '既有成片稿')`);
  await client.execute(`INSERT INTO publishing (id, script_content) VALUES (2, '')`);

  await workflowScriptSourceMigration.up(client);
  const shootingColumns = await client.execute('PRAGMA table_info(shooting)');
  const publishingColumns = await client.execute('PRAGMA table_info(publishing)');
  for (const columns of [shootingColumns, publishingColumns]) {
    assert.ok(columns.rows.some((column) => String(column.name) === 'script_source_production_id'));
    assert.ok(columns.rows.some((column) => String(column.name) === 'script_source_version'));
  }
  assert.deepEqual((await client.execute('SELECT id,script_content,script_source_production_id,script_source_version FROM shooting')).rows[0], {
    id: 1,
    script_content: '既有成片稿',
    script_source_production_id: null,
    script_source_version: null,
  }, 'legacy shooting text is retained and its unknown origin stays unknown');
  assert.deepEqual((await client.execute('SELECT id,script_content,script_source_production_id,script_source_version FROM publishing')).rows[0], {
    id: 2,
    script_content: '',
    script_source_production_id: null,
    script_source_version: null,
  }, 'legacy empty publishing text remains empty without inferred lineage');

  await workflowScriptSourceMigration.up(client);
  assert.deepEqual((await client.execute('SELECT id,script_content,script_source_production_id,script_source_version FROM publishing')).rows[0], {
    id: 2,
    script_content: '',
    script_source_production_id: null,
    script_source_version: null,
  }, 'migration retries remain idempotent and never rewrite legacy content');
  console.log('Workflow script source migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
