import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { retroActionCreateIdempotencyMigration } from '../../api/database/migrations/047_retro_action_create_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retro-action-create-migration-'));
const client = createClient({ url: `file:${path.join(directory, 'retrospective.db')}` });

try {
  await client.execute('CREATE TABLE retro_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)');
  await client.execute("INSERT INTO retro_actions (title) VALUES ('历史行动项')");
  await retroActionCreateIdempotencyMigration.up(client);
  await retroActionCreateIdempotencyMigration.up(client);
  assert.deepEqual(
    (await client.execute('SELECT id,title FROM retro_actions WHERE id=1')).rows[0],
    { id: 1, title: '历史行动项' },
    'migration preserves existing action rows',
  );

  const requestId = 'c01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await client.execute({
    sql: `INSERT INTO retro_action_create_request_keys
      (client_request_id,actor_id,retro_id,action_id,request_fingerprint) VALUES (?,?,?,?,?)`,
    args: [requestId, 7, 10, 1, 'same-payload'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO retro_action_create_request_keys
      (client_request_id,actor_id,retro_id,action_id,request_fingerprint) VALUES (?,?,?,?,?)`,
    args: [requestId, 8, 10, 2, 'different-payload'],
  }), /UNIQUE constraint failed/i, 'request key is globally unique across actors');
  console.log('Retrospective action create idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
