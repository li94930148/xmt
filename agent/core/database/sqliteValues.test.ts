import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, canonicalJsonHash, optionalText, requiredText, verifiedCanonicalObject } from './sqliteValues.js';

test('canonical JSON is stable for nested Chinese objects and arrays', () => {
  const first = canonicalJson('canonical_payload_json', { z: ['中文', { b: 2, a: 1 }], a: {} });
  const second = canonicalJson('canonical_payload_json', { a: {}, z: ['中文', { a: 1, b: 2 }] });
  assert.equal(first, second);
  assert.deepEqual(verifiedCanonicalObject('canonical_payload_json', first, canonicalJsonHash(first)), { a: {}, z: ['中文', { a: 1, b: 2 }] });
});

test('SQLite boundaries normalize optional values and reject unsafe values', () => {
  assert.equal(optionalText('optional', undefined), null);
  assert.equal(optionalText('boolean', true), '1');
  assert.equal(optionalText('date', new Date('2026-08-28T00:00:00.000Z')), '2026-08-28T00:00:00.000Z');
  for (const value of [undefined, {}, [], NaN, Infinity, () => undefined]) {
    assert.throws(() => requiredText('required_field', value), /UPLOAD_QUEUE_INVALID_SQL_VALUE/);
  }
  assert.throws(() => canonicalJson('payload', { invalid: undefined }), /UPLOAD_QUEUE_INVALID_SQL_VALUE/);
  assert.throws(() => canonicalJson('payload', { invalid: Infinity }), /UPLOAD_QUEUE_INVALID_SQL_VALUE/);
});

test('payload reads verify the stored string hash and canonical form', () => {
  const payload = canonicalJson('canonical_payload_json', { nested: { list: [] }, schema_version: 2 });
  assert.throws(() => verifiedCanonicalObject('canonical_payload_json', payload, '0'.repeat(64)), /UPLOAD_QUEUE_PAYLOAD_HASH_MISMATCH/);
  assert.throws(() => verifiedCanonicalObject('canonical_payload_json', '{"schema_version":2,"nested":{}}', canonicalJsonHash('{"schema_version":2,"nested":{}}')), /UPLOAD_QUEUE_PAYLOAD_NOT_CANONICAL/);
});
