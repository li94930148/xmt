import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { announcementCreateIdempotencyMigration } from '../../api/database/migrations/048_announcement_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-announcement-create-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'announcements.db')}` });

try {
  await client.execute('CREATE TABLE announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL)');
  await client.execute("INSERT INTO announcements (content) VALUES ('历史公告')");
  await announcementCreateIdempotencyMigration.up(client);
  await announcementCreateIdempotencyMigration.up(client);
  assert.deepEqual(
    (await client.execute('SELECT id,content FROM announcements WHERE id=1')).rows[0],
    { id: 1, content: '历史公告' },
    'migration preserves existing announcement rows',
  );

  const requestId = 'b0122334-4556-4788-899a-bbccddeeff00';
  await client.execute({
    sql: `INSERT INTO announcement_create_request_keys
      (client_request_id,actor_id,announcement_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 7, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO announcement_create_request_keys
      (client_request_id,actor_id,announcement_id,request_fingerprint) VALUES (?,?,?,?)`,
    args: [requestId, 8, 1, 'different-payload'],
  }), /UNIQUE constraint failed/i, 'request keys remain globally unique across actors');
  console.log('Announcement create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
