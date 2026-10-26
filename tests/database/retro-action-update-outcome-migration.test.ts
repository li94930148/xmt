import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { retroActionUpdateOutcomeMigration } from '../../api/database/migrations/056_retro_action_update_outcome.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retro-action-update-outcome-'));
const client = createClient({ url: `file:${path.join(directory, 'retrospective.db')}` });

try {
  await client.execute(`
    CREATE TABLE retro_action_update_request_keys (
      actor_id INTEGER NOT NULL,
      action_id INTEGER NOT NULL,
      client_request_id TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (actor_id, action_id, client_request_id)
    )
  `);
  await client.execute({
    sql: `INSERT INTO retro_action_update_request_keys
      (actor_id, action_id, client_request_id, request_fingerprint)
      VALUES (?, ?, ?, ?)`,
    args: [7, 10, 'c01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50', 'prior-success'],
  });

  await retroActionUpdateOutcomeMigration.up(client);
  await retroActionUpdateOutcomeMigration.up(client);
  const priorReceipt = await client.execute('SELECT outcome FROM retro_action_update_request_keys WHERE actor_id=7');
  assert.equal(String(priorReceipt.rows[0]?.outcome), 'processed', 'pre-migration receipts keep their successful meaning');

  await client.execute({
    sql: `INSERT INTO retro_action_update_request_keys
      (actor_id, action_id, client_request_id, request_fingerprint, outcome)
      VALUES (?, ?, ?, ?, ?)`,
    args: [8, 10, 'd01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50', 'conflict-payload', 'conflict'],
  });
  const conflictReceipt = await client.execute('SELECT outcome FROM retro_action_update_request_keys WHERE actor_id=8');
  assert.equal(String(conflictReceipt.rows[0]?.outcome), 'conflict');
  await assert.rejects(client.execute({
    sql: `INSERT INTO retro_action_update_request_keys
      (actor_id, action_id, client_request_id, request_fingerprint, outcome)
      VALUES (?, ?, ?, ?, ?)`,
    args: [9, 10, 'e01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50', 'invalid-outcome', 'unknown'],
  }), /CHECK constraint failed/i, 'outcomes are constrained to processed/conflict');
  console.log('Retrospective action update outcome migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
