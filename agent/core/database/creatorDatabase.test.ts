import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { CreatorDatabase } from './creatorDatabase.js';
import { canonicalJson, canonicalJsonHash } from './sqliteValues.js';

const input = (payload: unknown = { schema_version: 2, records: [] }) => {
  const payload_json = canonicalJson('canonical_payload_json', payload);
  return { batch_id: '11111111-1111-4111-8111-111111111111', platform: 'douyin', platform_account_id: 'account', source_file_sha256: 'a'.repeat(64), parser_version: 'douyin-export-v1', payload_json, payload_sha256: canonicalJsonHash(payload_json) };
};

test('old database receives the idempotent upload_queue migration without data loss', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'xmt-old-agent-db-'));
  const file = path.join(root, 'creator.db');
  const old = new DatabaseSync(file);
  old.exec('CREATE TABLE creator_accounts(id INTEGER PRIMARY KEY, platform TEXT); INSERT INTO creator_accounts(platform) VALUES(\'douyin\');');
  old.close();
  const first = new CreatorDatabase(file);
  assert.equal(first.enqueueUpload(input()).created, true);
  assert.equal(first.enqueueUpload(input()).created, false);
  assert.equal(first.parseUploadPayload(first.uploadJob(first.claimNextUpload()!.job_id)!).schema_version, 2);
  first.close();
  const second = new CreatorDatabase(file);
  const inspect = new DatabaseSync(file, { readOnly: true });
  assert.equal((inspect.prepare('SELECT COUNT(*) count FROM creator_accounts').get() as { count: number }).count, 1);
  assert.equal((inspect.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='upload_queue'").get() as { count: number }).count, 1);
  assert.equal((inspect.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check, 'ok');
  assert.equal((inspect.prepare('SELECT COUNT(*) count FROM pragma_foreign_key_check').get() as { count: number }).count, 0);
  inspect.close(); second.close(); rmSync(root, { recursive: true, force: true });
});

test('queue rejects direct objects and preserves hash/string equivalence', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'xmt-queue-boundary-'));
  const database = new CreatorDatabase(path.join(root, 'creator.db'));
  const invalid = { ...input(), payload_json: {} as unknown as string };
  assert.throws(() => database.enqueueUpload(invalid), /UPLOAD_QUEUE_INVALID_SQL_VALUE/);
  const created = database.enqueueUpload(input({ empty_array: [], empty_object: {}, title: '中文' }));
  const stored = database.uploadJob(created.job_id)!;
  assert.equal(canonicalJsonHash(stored.payload_json), stored.payload_sha256);
  database.close(); rmSync(root, { recursive: true, force: true });
});
