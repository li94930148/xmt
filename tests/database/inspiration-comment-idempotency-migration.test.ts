import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { inspirationCommentIdempotencyMigration } from '../../api/database/migrations/033_inspiration_comment_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-inspiration-comment-idempotency-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE inspiration_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspiration_id INTEGER NOT NULL,
    creator_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.execute({
    sql: 'INSERT INTO inspiration_comments (inspiration_id, creator_id, content, created_at) VALUES (?, ?, ?, ?)',
    args: [41, 7, '既有评论保留', '2026-10-20 10:00:00'],
  });

  await inspirationCommentIdempotencyMigration.up(client);
  const legacy = await client.execute('SELECT id, inspiration_id, creator_id, content, created_at, client_request_id FROM inspiration_comments WHERE id = 1');
  assert.deepEqual(legacy.rows[0], {
    id: 1,
    inspiration_id: 41,
    creator_id: 7,
    content: '既有评论保留',
    created_at: '2026-10-20 10:00:00',
    client_request_id: null,
  }, 'existing comments are preserved without guessed request identifiers');

  await inspirationCommentIdempotencyMigration.up(client);
  const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await client.execute({
    sql: 'INSERT INTO inspiration_comments (inspiration_id, creator_id, content, client_request_id) VALUES (?, ?, ?, ?)',
    args: [41, 7, '带有请求编号的新评论', requestId],
  });
  await assert.rejects(client.execute({
    sql: 'INSERT INTO inspiration_comments (inspiration_id, creator_id, content, client_request_id) VALUES (?, ?, ?, ?)',
    args: [41, 7, '重复请求不得生成第二条', requestId],
  }), /UNIQUE constraint failed/i);
  const rows = await client.execute('SELECT COUNT(*) AS total FROM inspiration_comments');
  assert.equal(Number(rows.rows[0].total), 2, 'the unique request key prevents duplicates while legacy rows remain valid');
  console.log('Inspiration comment idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
