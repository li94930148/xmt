import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { productionHistorySourceTopicMigration } from '../../api/database/migrations/068_production_history_source_topic.js';
import { assessMigrationReadiness } from '../../api/modules/ops/migration-readiness-decision.js';
import { migrationPolicies } from '../../api/database/migrations/policy.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-history-source-topic-'));
const client = createClient({ url: `file:${path.join(directory, 'history.db')}` });

try {
  await client.execute(`CREATE TABLE production_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    production_id INTEGER NOT NULL,
    version TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL
  )`);
  await client.execute({
    sql: 'INSERT INTO production_history(production_id,version,content,status) VALUES(?,?,?,?)',
    args: [10, 'v1.0', 'legacy content', 'approved'],
  });

  await productionHistorySourceTopicMigration.up(client);
  await productionHistorySourceTopicMigration.up(client);

  assert.equal(migrationPolicies['068'], 'SAFE_EXPAND');
  assert.equal(assessMigrationReadiness([productionHistorySourceTopicMigration], migrationPolicies, []).decision, 'GO');
  assert.deepEqual((await client.execute(
    'SELECT production_id,version,content,source_topic_id FROM production_history WHERE id=1',
  )).rows[0], {
    production_id: 10,
    version: 'v1.0',
    content: 'legacy content',
    source_topic_id: null,
  }, 'existing history stays byte-for-byte intact and its topic provenance is not inferred');

  const sourceTopicColumn = (await client.execute('PRAGMA table_info(production_history)')).rows.find(
    (column) => String(column.name) === 'source_topic_id',
  );
  assert.equal(String(sourceTopicColumn?.type).toUpperCase(), 'INTEGER');
  assert.equal(Number(sourceTopicColumn?.notnull), 0, 'the additive source topic field remains nullable for legacy versions');

  await client.execute({
    sql: 'INSERT INTO production_history(production_id,version,content,status,source_topic_id) VALUES(?,?,?,?,?)',
    args: [10, 'v1.1', 'new content', 'approved', 7],
  });
  assert.equal((await client.execute(
    'SELECT source_topic_id FROM production_history WHERE version=?', ['v1.1'],
  )).rows[0]?.source_topic_id, 7, 'new history can persist the topic that owned the snapshot');
  console.log('Production history source-topic migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
