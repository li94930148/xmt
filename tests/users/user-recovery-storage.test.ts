import assert from 'node:assert/strict';
import test from 'node:test';
import { persistVerifiedUserRecovery } from '../../src/pages/users/userRecoveryStorage.js';

test('user recovery marker is written and read back exactly', () => {
  const values = new Map<string, string>();
  persistVerifiedUserRecovery({
    setItem: (key, value) => values.set(key, value),
    getItem: (key) => values.get(key) ?? null,
  }, 'xmt:user-create-pending:v1:user:7', { requestId: 'request-1', username: 'editor' });

  assert.equal(
    values.get('xmt:user-create-pending:v1:user:7'),
    JSON.stringify({ requestId: 'request-1', username: 'editor' }),
  );
});

test('a silently dropped recovery marker fails closed', () => {
  let writes = 0;
  assert.throws(() => persistVerifiedUserRecovery({
    setItem: () => { writes += 1; },
    getItem: () => null,
  }, 'xmt:user-update-pending:v1:actor:7', { requestId: 'request-2' }), /未能完整保存/);
  assert.equal(writes, 1);
});

test('a mismatched recovery marker fails closed', () => {
  let saved = '';
  assert.throws(() => persistVerifiedUserRecovery({
    setItem: (_key, value) => { saved = `${value} `; },
    getItem: () => saved,
  }, 'xmt:user-delete-pending:v1:actor:7', { requestId: 'request-3' }), /未能完整保存/);
});

test('storage read failure propagates so callers do not issue a write request', () => {
  let writes = 0;
  assert.throws(() => persistVerifiedUserRecovery({
    setItem: () => { writes += 1; },
    getItem: () => { throw new Error('storage unavailable'); },
  }, 'xmt:user-toggle-pending:v1:actor:7', { requestId: 'request-4' }), /storage unavailable/);
  assert.equal(writes, 1);
});
