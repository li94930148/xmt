import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createClient } from '@libsql/client';
import { messageReadAllIdempotencyMigration } from '../../api/database/migrations/044_message_read_all_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-message-read-all-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0
  )`);
  await client.execute({
    sql: 'INSERT INTO messages(user_id,title,content,read) VALUES(?,?,?,?)',
    args: [7, 'existing-message', 'must survive the additive migration', 0],
  });

  await messageReadAllIdempotencyMigration.up(client);
  await messageReadAllIdempotencyMigration.up(client);

  const legacy = await client.execute('SELECT id,user_id,title,content,read FROM messages WHERE id=1');
  assert.deepEqual(legacy.rows[0], {
    id: 1,
    user_id: 7,
    title: 'existing-message',
    content: 'must survive the additive migration',
    read: 0,
  }, 'the additive migration preserves existing unread message data');

  const columns = await client.execute('PRAGMA table_info(message_read_all_request_keys)');
  assert.deepEqual(columns.rows.map((column) => String(column.name)), [
    'client_request_id', 'actor_id', 'updated_count', 'created_at',
  ]);
  assert.equal(columns.rows.filter((column) => Number(column.pk) > 0).map((column) => String(column.name)).join(','), 'client_request_id');

  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a70';
  await client.execute({
    sql: 'INSERT INTO message_read_all_request_keys(client_request_id,actor_id,updated_count) VALUES(?,?,?)',
    args: [requestId, 7, 3],
  });
  await assert.rejects(client.execute({
    sql: 'INSERT INTO message_read_all_request_keys(client_request_id,actor_id,updated_count) VALUES(?,?,?)',
    args: [requestId, 7, 4],
  }), /UNIQUE constraint failed/i, 'one request ID stores exactly one read-all outcome');

  const record = await client.execute(
    'SELECT actor_id,updated_count FROM message_read_all_request_keys WHERE client_request_id=?',
    [requestId],
  );
  assert.deepEqual(record.rows[0], { actor_id: 7, updated_count: 3 });
  console.log('message read-all idempotency migration test passed');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
