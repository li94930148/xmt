import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { retrospectiveUpdateIdempotencyMigration } from '../../api/database/migrations/057_retrospective_update_idempotency.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retro-update-idempotency-'));
const client = createClient({ url: `file:${path.join(directory, 'retrospective.db')}` });

try {
  await retrospectiveUpdateIdempotencyMigration.up(client);
  await retrospectiveUpdateIdempotencyMigration.up(client);
  const columns = await client.execute('PRAGMA table_info(retrospective_update_request_keys)');
  const names = new Set(columns.rows.map((column) => String(column.name)));
  assert.deepEqual([...names].sort(), [
    'actor_id', 'client_request_id', 'created_at', 'outcome', 'request_fingerprint', 'retrospective_id',
  ]);
  const outcomeColumn = columns.rows.find((column) => String(column.name) === 'outcome');
  assert.equal(Number(outcomeColumn?.notnull), 1, 'receipt outcome must be non-null');
  assert.equal(String(outcomeColumn?.dflt_value).replace(/'/g, ''), 'processed', 'receipt outcome defaults to processed');

  await client.execute({
    sql: `INSERT INTO retrospective_update_request_keys
      (actor_id, retrospective_id, client_request_id, request_fingerprint)
      VALUES (?, ?, ?, ?)`,
    args: [7, 10, 'c01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50', 'successful-payload'],
  });
  const priorOutcome = await client.execute('SELECT outcome FROM retrospective_update_request_keys WHERE actor_id=7');
  assert.equal(String(priorOutcome.rows[0]?.outcome), 'processed', 'new receipts default to a replay-safe success outcome');

  await client.execute({
    sql: `INSERT INTO retrospective_update_request_keys
      (actor_id, retrospective_id, client_request_id, request_fingerprint, outcome)
      VALUES (?, ?, ?, ?, ?)`,
    args: [8, 10, 'd01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50', 'conflict-payload', 'conflict'],
  });
  await assert.rejects(client.execute({
    sql: `INSERT INTO retrospective_update_request_keys
      (actor_id, retrospective_id, client_request_id, request_fingerprint, outcome)
      VALUES (?, ?, ?, ?, ?)`,
    args: [9, 10, 'e01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50', 'invalid-payload', 'unknown'],
  }), /CHECK constraint failed/i);
  const primaryKey = columns.rows
    .filter((column) => Number(column.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map((column) => String(column.name));
  assert.deepEqual(primaryKey, ['actor_id', 'retrospective_id', 'client_request_id']);

  const driftClient = createClient({ url: `file:${path.join(directory, 'drift.db')}` });
  await driftClient.execute(`CREATE TABLE retrospective_update_request_keys (
    actor_id INTEGER NOT NULL,
    retrospective_id INTEGER NOT NULL,
    client_request_id TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    outcome TEXT CHECK (outcome IN ('processed', 'conflict')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_id, retrospective_id, client_request_id)
  )`);
  await assert.rejects(
    retrospectiveUpdateIdempotencyMigration.up(driftClient),
    /RETROSPECTIVE_UPDATE_OUTCOME_SCHEMA_INVALID/,
    'an existing table with a nullable outcome is rejected instead of treated as a valid migration',
  );
  driftClient.close();
  console.log('Retrospective update idempotency migration test passed.');
} finally {
  client.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
