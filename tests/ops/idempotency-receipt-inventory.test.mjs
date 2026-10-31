import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/idempotency-receipt-inventory.mjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-receipt-inventory-'));
const databasePath = path.join(directory, 'isolated.db');
const runSql = (sql) => execFileSync('sqlite3', [databasePath, sql], { encoding: 'utf8' });

try {
  runSql(`
    CREATE TABLE retrospective_update_request_keys (
      actor_id INTEGER NOT NULL,
      client_request_id TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO retrospective_update_request_keys VALUES
      (7, 'private-request-id', 'private-fingerprint', 'processed', '2026-10-20 01:00:00'),
      (7, 'private-request-id-2', 'private-fingerprint-2', 'conflict', '2026-10-24 01:00:00');
    CREATE TABLE inspiration_comments (
      id INTEGER PRIMARY KEY,
      content TEXT NOT NULL,
      client_request_id TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO inspiration_comments VALUES
      (1, 'private comment body', 'comment-request-key', '2026-10-21 00:00:00'),
      (2, 'legacy comment body', NULL, '2026-10-22 00:00:00');
    CREATE TABLE creator_agent_bind_result_recovery (request_id_hash TEXT, created_at TEXT);
    CREATE TABLE anonymous_feedback_submission_request_keys (
      client_request_id TEXT PRIMARY KEY,
      target_feedback_id INTEGER NOT NULL,
      request_fingerprint TEXT NOT NULL,
      created_at TEXT
    );
    INSERT INTO anonymous_feedback_submission_request_keys VALUES
      ('private-anonymous-feedback-key', 1, 'private-anonymous-feedback-fingerprint', '2026-10-25 01:00:00'),
      ('private-anonymous-feedback-key-utc', 1, 'private-anonymous-feedback-fingerprint-utc', '2026-10-25T01:00:00.000Z'),
      ('private-anonymous-feedback-key-offset', 1, 'private-anonymous-feedback-fingerprint-offset', '2026-10-25T09:00:00+08:00'),
      ('private-anonymous-feedback-key-invalid', 1, 'private-anonymous-feedback-fingerprint-invalid', 'not-a-date'),
      ('private-anonymous-feedback-key-invalid-offset', 1, 'private-anonymous-feedback-fingerprint-invalid-offset', '2026-10-25T09:00:00+99:99'),
      ('private-anonymous-feedback-key-invalid-utc', 1, 'private-anonymous-feedback-fingerprint-invalid-utc', '2026-00-25T00:00:00Z'),
      ('private-anonymous-feedback-key-missing', 1, 'private-anonymous-feedback-fingerprint-missing', NULL);
  `);

  const beforeHash = crypto.createHash('sha256').update(fs.readFileSync(databasePath)).digest('hex');
  const result = spawnSync(process.execPath, [script, '--db', databasePath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.readOnly, true);
  assert.equal(inventory.cleanupPerformed, false);
  assert.equal(inventory.tables.length, 3, 'unrelated and expiring recovery tables are out of scope');
  assert.deepEqual(inventory.tables.map((table) => [table.table, table.rowCount]), [
    ['anonymous_feedback_submission_request_keys', 7],
    ['inspiration_comments', 1],
    ['retrospective_update_request_keys', 2],
  ]);
  assert.deepEqual(inventory.tables[0].timestampProfile, {
    utcSuffixCount: 1,
    explicitOffsetCount: 1,
    timezoneNaiveParseableCount: 1,
    unsupportedOrMissingCount: 4,
    hasMixedRepresentations: true,
  }, 'receipt timestamps report format counts without inferring timezone or expiry');
  assert.deepEqual(inventory.tables[1].timestampProfile, {
    utcSuffixCount: 0,
    explicitOffsetCount: 0,
    timezoneNaiveParseableCount: 1,
    unsupportedOrMissingCount: 0,
    hasMixedRepresentations: false,
  }, 'embedded comment receipts are scoped to rows with a request key');
  assert.match(inventory.timestampNote, /not assumed to be UTC or Beijing time/);
  assert.equal(inventory.tables[0].kind, 'request_receipt');
  assert.equal(inventory.tables[1].kind, 'embedded_request_key');
  assert.equal(inventory.tables[2].oldestCreatedAtRaw, '2026-10-20 01:00:00');
  assert.equal(inventory.tables[2].newestCreatedAtRaw, '2026-10-24 01:00:00');
  assert.equal(/private-request|private-fingerprint|private comment|comment-request-key|private-anonymous-feedback/.test(result.stdout), false);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(databasePath)).digest('hex'), beforeHash, 'inventory must not modify the database file');

  const missingDbArgument = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(missingDbArgument.status, 2);
  const extraArgument = spawnSync(process.execPath, [script, '--db', databasePath, '--cleanup'], { encoding: 'utf8' });
  assert.equal(extraArgument.status, 2, 'inventory rejects any unrecognized argument, including a cleanup flag');

  const malformedPath = path.join(directory, 'malformed.db');
  execFileSync('sqlite3', [malformedPath, 'CREATE TABLE broken_request_keys (client_request_id TEXT);']);
  const malformed = spawnSync(process.execPath, [script, '--db', malformedPath], { encoding: 'utf8' });
  assert.notEqual(malformed.status, 0, 'unexpected receipt schema must fail closed');

  console.log('Idempotency receipt inventory tests passed.');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
