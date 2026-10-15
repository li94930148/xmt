import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSocketDisconnectReason,
  safeClientErrorClass,
  serializeClientLog,
} from '../../src/observability/client-logger.ts';

test('browser log contract keeps auth state but drops IDs and credential-like metadata', () => {
  const line = serializeClientLog({
    event: 'auth.login_trace',
    level: 'debug',
    fields: {
      authEvent: 'auth.response.received',
      mode: 'v1-web',
      status: 200,
      httpStatus: 200,
      responseKind: 'v1-envelope',
      requestId: 'private-request-id',
      loginAttemptId: 'private-attempt-id',
      hasRequestId: true,
      hasLoginAttemptId: true,
      token: 'private-token',
    },
  }, '2026-09-30T00:00:00.000Z');
  const record = JSON.parse(line) as Record<string, unknown>;

  assert.deepEqual(record, {
    timestamp: '2026-09-30T00:00:00.000Z',
    level: 'debug',
    application: 'xmt-web',
    event: 'auth.login_trace',
    authEvent: 'auth.response.received',
    mode: 'v1-web',
    httpStatus: 200,
    responseKind: 'v1-envelope',
    hasRequestId: true,
    hasLoginAttemptId: true,
  });
  assert.doesNotMatch(line, /private-request|private-attempt|private-token|requestId|loginAttemptId/);
});

test('browser error and socket logs only retain safe classes and known disconnect reasons', () => {
  const line = serializeClientLog({
    event: 'socket.connect_failed',
    level: 'warn',
    fields: { errorClass: 'TypeError', message: 'token=private-token', socketId: 'private-socket-id' },
  });
  assert.match(line, /"errorClass":"TypeError"/);
  assert.doesNotMatch(line, /private-token|private-socket-id|message/);
  assert.equal(normalizeSocketDisconnectReason('ping timeout'), 'ping timeout');
  assert.equal(normalizeSocketDisconnectReason('token=private-token'), 'unknown');
  assert.equal(safeClientErrorClass(new TypeError('private server response')), 'TypeError');
  assert.equal(safeClientErrorClass('token=private-token'), 'OtherError');
});
