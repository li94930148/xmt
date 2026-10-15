import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { productionMaterialHistorySnapshotMigration } from '../../api/database/migrations/028_production_material_history_snapshot.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-material-history-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE production_history (
    id INTEGER PRIMARY KEY,
    production_id INTEGER NOT NULL,
    version TEXT NOT NULL,
    content TEXT NOT NULL
  )`);
  await client.execute("INSERT INTO production_history(id,production_id,version,content) VALUES(1,10,'v1.0','现有历史正文')");

  await productionMaterialHistorySnapshotMigration.up(client);
  await productionMaterialHistorySnapshotMigration.up(client);

  const legacy = await client.execute('SELECT content,material_draft_snapshot_html FROM production_history WHERE id=1');
  assert.deepEqual(legacy.rows[0], {
    content: '现有历史正文',
    material_draft_snapshot_html: null,
  }, 'migration adds nullable history without guessing old material drafts or changing manuscript content');

  await client.execute({
    sql: `INSERT INTO production_history(id,production_id,version,content,material_draft_snapshot_html)
          VALUES(2,10,'v2.0','新历史正文','')`,
  });
  const intentionalEmpty = await client.execute('SELECT material_draft_snapshot_html FROM production_history WHERE id=2');
  assert.deepEqual(intentionalEmpty.rows[0], { material_draft_snapshot_html: '' }, 'an empty draft snapshot is distinct from a legacy unrecorded snapshot');
  console.log('Production material history snapshot migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
