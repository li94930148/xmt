import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { inspirationCreateIdempotencyMigration } from '../../api/database/migrations/034_inspiration_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-inspiration-create-idempotency-'));
const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` });

try {
  await client.execute(`CREATE TABLE inspirations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    creator_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await client.execute({
    sql: 'INSERT INTO inspirations (title, description, category, creator_id) VALUES (?, ?, ?, ?)',
    args: ['既有灵感', '历史内容', '故事', 7],
  });

  await inspirationCreateIdempotencyMigration.up(client);
  const legacy = await client.execute('SELECT id, title, description FROM inspirations WHERE id = 1');
  assert.deepEqual(legacy.rows[0], { id: 1, title: '既有灵感', description: '历史内容' });
  await inspirationCreateIdempotencyMigration.up(client);

  const requestId = 'd01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await client.execute({
    sql: 'INSERT INTO inspirations (title, description, category, creator_id) VALUES (?, ?, ?, ?)',
    args: ['新灵感', '', '故事', 7],
  });
  await client.execute({
    sql: 'INSERT INTO inspiration_create_request_keys (client_request_id, creator_id, inspiration_id, request_fingerprint) VALUES (?, ?, ?, ?)',
    args: [requestId, 7, 2, 'fingerprint'],
  });
  await assert.rejects(client.execute({
    sql: 'INSERT INTO inspiration_create_request_keys (client_request_id, creator_id, inspiration_id, request_fingerprint) VALUES (?, ?, ?, ?)',
    args: [requestId, 7, 2, 'different-fingerprint'],
  }), /UNIQUE constraint failed/i);
  const rows = await client.execute('SELECT COUNT(*) AS total FROM inspirations');
  assert.equal(Number(rows.rows[0].total), 2, 'the request key prevents duplicates while legacy inspirations remain valid');
  await client.execute('DELETE FROM inspirations WHERE id = 2');
  const retainedKey = await client.execute('SELECT inspiration_id, request_fingerprint FROM inspiration_create_request_keys WHERE client_request_id = ?', [requestId]);
  assert.deepEqual(retainedKey.rows[0], { inspiration_id: 2, request_fingerprint: 'fingerprint' }, 'deleting an inspiration does not erase its idempotency tombstone');
  console.log('Inspiration create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
