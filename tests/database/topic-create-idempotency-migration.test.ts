import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { topicCreateIdempotencyMigration } from '../../api/database/migrations/058_topic_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-topic-create-idempotency-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'topics.db')}` });

try {
  await client.execute('CREATE TABLE topics (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)');
  await client.execute("INSERT INTO topics(title) VALUES('既有选题')");

  await topicCreateIdempotencyMigration.up(client);
  await topicCreateIdempotencyMigration.up(client);

  assert.deepEqual(
    (await client.execute('SELECT id,title FROM topics WHERE id=1')).rows[0],
    { id: 1, title: '既有选题' },
    'the additive migration preserves existing topics',
  );

  const columns = await client.execute('PRAGMA table_info(topic_create_request_keys)');
  const columnNames = new Set(columns.rows.map((column) => String(column.name)));
  assert.deepEqual(
    [...columnNames].sort(),
    ['actor_id', 'client_request_id', 'created_at', 'request_fingerprint', 'topic_id'],
  );
  assert.equal(
    columns.rows.find((column) => String(column.name) === 'client_request_id')?.pk,
    1,
    'request IDs are globally unique so actor reuse can fail closed',
  );

  const requestId = 'b0122334-4556-4788-899a-bbccddeeff01';
  await client.execute({
    sql: `INSERT INTO topic_create_request_keys
      (client_request_id,actor_id,topic_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO topic_create_request_keys
      (client_request_id,actor_id,topic_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 8, 1, 'different-payload'],
  }), /UNIQUE constraint failed/i, 'a receipt key cannot be claimed by a second actor');

  console.log('Topic create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
