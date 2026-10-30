import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { productionOutlineOriginSnapshotMigration } from '../../api/database/migrations/027_production_outline_origin_snapshot.js';
import { productionOutlineSourceVersionMigration } from '../../api/database/migrations/030_production_outline_source_version.js';
import { productionOriginSourceTopicMigration } from '../../api/database/migrations/067_production_origin_source_topic.js';
import { migrationPolicies } from '../../api/database/migrations/policy.js';
import { assessMigrationReadiness } from '../../api/modules/ops/migration-readiness-decision.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-outline-origin-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute('PRAGMA foreign_keys=ON');
  await client.execute('CREATE TABLE topics (id INTEGER PRIMARY KEY, outline TEXT)');
  await client.execute(`CREATE TABLE production (
    id INTEGER PRIMARY KEY,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    content TEXT NOT NULL
  )`);
  await client.execute("INSERT INTO topics (id, outline) VALUES (1, '现行大纲')");
  await client.execute("INSERT INTO production (id, topic_id, content) VALUES (10, 1, '旧稿正文')");

  await productionOutlineOriginSnapshotMigration.up(client);
  const legacy = await client.execute('SELECT * FROM production_origin_snapshots WHERE production_id=10');
  assert.equal(legacy.rows.length, 0, 'migration does not infer or backfill a legacy production origin');
  assert.deepEqual(
    (await client.execute('SELECT id,topic_id,content FROM production WHERE id=10')).rows[0],
    { id: 10, topic_id: 1, content: '旧稿正文' },
    'migration leaves existing manuscript content unchanged',
  );

  await productionOutlineOriginSnapshotMigration.up(client);
  const existingProductionId = Number((await client.execute(
    "INSERT INTO production (topic_id, content) VALUES (1, '旧快照') RETURNING id",
  )).rows[0].id);
  await client.execute({
    sql: "INSERT INTO production_origin_snapshots (production_id, source_type, source_content_snapshot) VALUES (?, 'topic_outline', ?)",
    args: [existingProductionId, '旧快照'],
  });
  await productionOutlineSourceVersionMigration.up(client);
  await productionOutlineSourceVersionMigration.up(client);
  await productionOriginSourceTopicMigration.up(client);
  await productionOriginSourceTopicMigration.up(client);
  assert.equal(migrationPolicies['067'], 'SAFE_EXPAND');
  assert.equal(assessMigrationReadiness([productionOriginSourceTopicMigration], migrationPolicies, []).decision, 'GO');
  assert.deepEqual(
    (await client.execute('SELECT source_outline_version,source_topic_id FROM production_origin_snapshots WHERE production_id=?', [existingProductionId])).rows[0],
    { source_outline_version: null, source_topic_id: null },
    'legacy snapshot version and topic identities are not guessed',
  );

  const productionId = Number((await client.execute(
    "INSERT INTO production (topic_id, content) VALUES (1, '') RETURNING id",
  )).rows[0].id);
  await client.execute({
    sql: "INSERT INTO production_origin_snapshots (production_id, source_type, source_content_snapshot, source_outline_version, source_topic_id) VALUES (?, 'topic_outline', ?, ?, ?)",
    args: [productionId, '', 'v1.0', 1],
  });
  const emptyOrigin = await client.execute({
    sql: 'SELECT source_type,source_content_snapshot,source_outline_version,source_topic_id,captured_at FROM production_origin_snapshots WHERE production_id=?',
    args: [productionId],
  });
  assert.deepEqual(emptyOrigin.rows[0], {
    source_type: 'topic_outline',
    source_content_snapshot: '',
    source_outline_version: 'v1.0',
    source_topic_id: 1,
    captured_at: emptyOrigin.rows[0]?.captured_at,
  }, 'an intentionally empty source outline is retained as a valid exact snapshot');
  assert.ok(String(emptyOrigin.rows[0]?.captured_at || '').length > 0, 'snapshot capture time is recorded');

  await assert.rejects(() => client.execute({
    sql: 'INSERT INTO production_origin_snapshots (production_id, source_type, source_content_snapshot) VALUES (?, ?, ?)',
    args: [productionId, 'unknown', 'not an outline'],
  }), /CHECK constraint failed/);
  await client.execute('DELETE FROM production WHERE id=?', [productionId]);
  assert.equal((await client.execute('SELECT * FROM production_origin_snapshots WHERE production_id=?', [productionId])).rows.length, 0, 'snapshot lifecycle follows its production record');
  console.log('Production outline origin snapshot migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
