import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createClient } from '@libsql/client';
import { messageClearIdempotencyMigration } from '../../api/database/migrations/042_message_clear_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-message-clear-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL
  )`);
  await client.execute({
    sql: 'INSERT INTO messages(user_id,title,content) VALUES(?,?,?)',
    args: [7, 'existing-message', 'must survive the additive migration'],
  });

  await messageClearIdempotencyMigration.up(client);
  await messageClearIdempotencyMigration.up(client);
  const legacy = await client.execute('SELECT id,user_id,title,content FROM messages WHERE id=1');
  assert.deepEqual(legacy.rows[0], {
    id: 1,
    user_id: 7,
    title: 'existing-message',
    content: 'must survive the additive migration',
  }, 'the additive migration preserves existing message data');

  const columns = await client.execute('PRAGMA table_info(message_clear_request_keys)');
  assert.deepEqual(columns.rows.map((column) => String(column.name)), [
    'client_request_id', 'actor_id', 'deleted_count', 'created_at',
  ]);
  assert.equal(columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name)).join(','), 'client_request_id');

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a63';
  await client.execute({
    sql: 'INSERT INTO message_clear_request_keys(client_request_id,actor_id,deleted_count) VALUES(?,?,?)',
    args: [requestId, 7, 5],
  });
  await assert.rejects(client.execute({
    sql: 'INSERT INTO message_clear_request_keys(client_request_id,actor_id,deleted_count) VALUES(?,?,?)',
    args: [requestId, 7, 6],
  }), /UNIQUE constraint failed/i, 'a clear request ID can only record one outcome');
  await client.execute('DELETE FROM messages WHERE user_id=7');
  const record = await client.execute(
    'SELECT actor_id,deleted_count FROM message_clear_request_keys WHERE client_request_id=?',
    [requestId],
  );
  assert.deepEqual(record.rows[0], { actor_id: 7, deleted_count: 5 }, 'clear results remain available after messages are deleted');
  console.log('message clear idempotency migration test passed');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
