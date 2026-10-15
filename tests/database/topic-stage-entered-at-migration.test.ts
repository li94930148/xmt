import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { topicStageEnteredAtMigration } from '../../api/database/migrations/025_topic_stage_entered_at.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-topic-stage-entered-at-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.execute({
    sql: 'INSERT INTO topics (title, status, created_at) VALUES (?, ?, ?)',
    args: ['既有选题', 'production', '2025-01-02 03:04:05'],
  });

  await topicStageEnteredAtMigration.up(client);
  const columns = await client.execute('PRAGMA table_info(topics)');
  assert.ok(columns.rows.some((column) => String(column.name) === 'stage_entered_at'), 'migration adds the nullable stage timestamp');
  const existing = await client.execute('SELECT id,title,status,created_at,stage_entered_at FROM topics WHERE id=1');
  assert.deepEqual(existing.rows[0], {
    id: 1,
    title: '既有选题',
    status: 'production',
    created_at: '2025-01-02 03:04:05',
    stage_entered_at: null,
  }, 'legacy topics remain unchanged and are not backfilled from history or updated_at');

  await topicStageEnteredAtMigration.up(client);
  const afterRetry = await client.execute('SELECT id,title,status,created_at,stage_entered_at FROM topics WHERE id=1');
  assert.deepEqual(afterRetry.rows[0], existing.rows[0], 'migration is idempotent and preserves legacy values');
  console.log('Topic stage timestamp migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
