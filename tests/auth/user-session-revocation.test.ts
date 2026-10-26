import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-user-revocation-'));
process.env.XMT_DB_PATH = path.join(directory, 'security.test.db');
process.env.JWT_SECRET = 'user-revocation-test-secret';
process.env.NODE_ENV = 'test';
const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { SessionService } = await import('../../api/modules/auth/session/session.service.js');
const { SqliteSessionRepository } = await import('../../api/modules/auth/session/session.sqlite-repository.js');
const { io, server } = await import('../../api/app.js');
await initDatabase();

function userUpdateRequestFingerprint(targetUserId: number, body: Record<string, unknown>) {
  const fields = ['password', 'email', 'role', 'name', 'enabled'];
  const canonicalPayload = fields.map((field) => [
    field,
    Object.prototype.hasOwnProperty.call(body, field),
    body[field] ?? null,
  ]);
  return createHmac('sha256', process.env.JWT_SECRET!)
    .update(JSON.stringify([targetUserId, canonicalPayload]))
    .digest('hex');
}

const adminRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE code = ?', ['admin']);
assert(adminRole);
const adminId = await executeInsert(`INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)`, ['revocation-admin', 'unused', 'admin', 'Admin', 1, 0]);
await execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [adminId, adminRole.id]);
const targetId = await executeInsert(`INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,?)`, ['revocation-target', 'unused', 'member', 'Target', 1, 0]);
const sessions = new SessionService({ repository: new SqliteSessionRepository() });
const sessionId = await sessions.createSession({ userId: targetId, clientType: 'web' });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
const waitFor = (socket: Socket, event: string) => new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), 1_000); socket.once(event, () => { clearTimeout(timer); resolve(); }); });
let socket: Socket | null = null;
let deleteSocket: Socket | null = null;
let replaySocket: Socket | null = null;
let updateReplaySocket: Socket | null = null;
let profileReplaySocket: Socket | null = null;
try {
  const adminBeforeSelfDisableChecks = await queryOne<{ enabled: number; auth_version: number }>(
    'SELECT enabled,auth_version FROM users WHERE id=?',
    [adminId],
  );
  assert.deepEqual(adminBeforeSelfDisableChecks, { enabled: 1, auth_version: 1 });

  for (const invalidEnabled of [0, null, 'false']) {
    const invalidEnabledResponse = await fetch(`${base}/api/users/${adminId}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: invalidEnabled }),
    });
    assert.equal(invalidEnabledResponse.status, 400, `non-boolean enabled value ${String(invalidEnabled)} is rejected`);
    assert.deepEqual(await queryOne<{ enabled: number; auth_version: number }>(
      'SELECT enabled,auth_version FROM users WHERE id=?',
      [adminId],
    ), adminBeforeSelfDisableChecks, 'invalid enabled input does not write the current user');
  }

  const selfDisableResponse = await fetch(`${base}/api/users/${adminId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(selfDisableResponse.status, 400, 'the current user cannot disable their own account');
  assert.deepEqual(await queryOne<{ enabled: number; auth_version: number }>(
    'SELECT enabled,auth_version FROM users WHERE id=?',
    [adminId],
  ), adminBeforeSelfDisableChecks, 'self-disable rejection leaves the current user unchanged');

  const selfEnableResponse = await fetch(`${base}/api/users/${adminId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(selfEnableResponse.status, 200, 'a boolean true enabled value remains valid');
  assert.deepEqual(await queryOne<{ enabled: number; auth_version: number }>(
    'SELECT enabled,auth_version FROM users WHERE id=?',
    [adminId],
  ), adminBeforeSelfDisableChecks, 'valid enabled=true keeps the current account active');

  socket = connect(base, { auth: { token: signToken({ userId: targetId }) }, transports: ['websocket'], reconnection: false });
  await waitFor(socket, 'connect');

  await execute(`
    CREATE TRIGGER reject_user_session_revocation
    BEFORE UPDATE ON auth_sessions
    WHEN NEW.revoke_reason='user_disabled'
    BEGIN SELECT RAISE(ABORT, 'simulated session revocation failure'); END
  `);
  const failed = await fetch(`${base}/api/users/${targetId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(failed.status, 500, 'failed session revocation fails the disable operation');
  assert.deepEqual(await failed.json(), { message: '更新用户失败' }, 'database details are not exposed');
  assert.deepEqual(
    await queryOne<{ enabled: number; auth_version: number }>('SELECT enabled,auth_version FROM users WHERE id=?', [targetId]),
    { enabled: 1, auth_version: 1 },
    'account status and auth version roll back when session revocation fails',
  );
  assert.equal((await sessions.getSession(sessionId)).state, 'ACTIVE', 'the session remains active only while the account is still enabled');
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM activity_log WHERE user_id=? AND action='update' AND target='user' AND detail LIKE '%revocation-target%'",
    [adminId],
  ))?.count || 0), 0, 'failed disable leaves no audit entry');
  assert.equal(socket.connected, true, 'failed disable does not disconnect the user socket');

  await execute('DROP TRIGGER reject_user_session_revocation');
  const disconnected = waitFor(socket, 'disconnect');
  const response = await fetch(`${base}/api/users/${targetId}`, { method: 'PUT', headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
  assert.equal(response.status, 200);
  await disconnected;
  assert.equal((await sessions.getSession(sessionId)).state, 'REVOKED');
  assert.deepEqual(
    await queryOne<{ enabled: number; auth_version: number }>('SELECT enabled,auth_version FROM users WHERE id=?', [targetId]),
    { enabled: 0, auth_version: 2 },
  );
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM activity_log WHERE user_id=? AND action='update' AND target='user' AND detail LIKE '%revocation-target%'",
    [adminId],
  ))?.count || 0), 1, 'successful disable creates exactly one audit entry');

  const updateReplayTargetId = await executeInsert(
    'INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,0)',
    ['revocation-update-replay-target', 'unused', 'member', 'Update replay target', 1],
  );
  const updateReplaySessionId = await sessions.createSession({ userId: updateReplayTargetId, clientType: 'web' });
  updateReplaySocket = connect(base, { auth: { token: signToken({ userId: updateReplayTargetId }) }, transports: ['websocket'], reconnection: false });
  await waitFor(updateReplaySocket, 'connect');
  const updateReplayRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a59';
  const disablePayload = { enabled: false };
  const updateReplayFingerprint = userUpdateRequestFingerprint(updateReplayTargetId, disablePayload);
  // Model a prior process that committed the disable and request marker, but
  // exited before invalidating the target's permission cache and live socket.
  await execute('UPDATE users SET enabled=0,auth_version=auth_version+1 WHERE id=?', [updateReplayTargetId]);
  await execute(
    'UPDATE auth_sessions SET revoked_at=?,revoke_reason=? WHERE user_id=? AND revoked_at IS NULL',
    ['2026-10-22 10:00:00', 'user_disabled', updateReplayTargetId],
  );
  await execute(
    `INSERT INTO activity_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)`,
    [adminId, 'update', 'user', '更新用户: revocation-update-replay-target', '2026-10-22 10:00:00'],
  );
  await execute(
    `INSERT INTO user_update_request_keys(client_request_id,actor_id,target_user_id,request_fingerprint,created_at)
     VALUES(?,?,?,?,?)`,
    [updateReplayRequestId, adminId, updateReplayTargetId, updateReplayFingerprint, '2026-10-22 10:00:00'],
  );
  const updateReplayDisconnected = waitFor(updateReplaySocket, 'disconnect');
  const updateReplayResponse = await fetch(`${base}/api/users/${updateReplayTargetId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...disablePayload, client_request_id: updateReplayRequestId }),
  });
  assert.equal(updateReplayResponse.status, 200, 'a committed disable can be safely replayed');
  await updateReplayDisconnected;
  assert.deepEqual(await updateReplayResponse.json(), { message: '用户更新成功', idempotent_replay: true });
  assert.equal((await sessions.getSession(updateReplaySessionId)).state, 'REVOKED', 'replayed disable keeps the session revoked');
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM activity_log WHERE user_id=? AND action='update' AND target='user' AND detail LIKE '%revocation-update-replay-target%'",
    [adminId],
  ))?.count || 0), 1, 'replaying the disable does not duplicate its audit entry');

  const profileReplayTargetId = await executeInsert(
    'INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,0)',
    ['revocation-profile-replay-target', 'unused', 'member', 'Original profile name', 1],
  );
  profileReplaySocket = connect(base, { auth: { token: signToken({ userId: profileReplayTargetId }) }, transports: ['websocket'], reconnection: false });
  await waitFor(profileReplaySocket, 'connect');
  const profileReplayRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a60';
  const profilePayload = { name: 'Updated profile name' };
  const profileReplayFingerprint = userUpdateRequestFingerprint(profileReplayTargetId, profilePayload);
  await execute('UPDATE users SET name=? WHERE id=?', [profilePayload.name, profileReplayTargetId]);
  await execute(
    `INSERT INTO activity_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)`,
    [adminId, 'update', 'user', '更新用户: revocation-profile-replay-target', '2026-10-22 10:00:01'],
  );
  await execute(
    `INSERT INTO user_update_request_keys(client_request_id,actor_id,target_user_id,request_fingerprint,created_at)
     VALUES(?,?,?,?,?)`,
    [profileReplayRequestId, adminId, profileReplayTargetId, profileReplayFingerprint, '2026-10-22 10:00:01'],
  );
  const profileReplayResponse = await fetch(`${base}/api/users/${profileReplayTargetId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...profilePayload, client_request_id: profileReplayRequestId }),
  });
  assert.equal(profileReplayResponse.status, 200, 'a profile-only update can be safely replayed');
  assert.deepEqual(await profileReplayResponse.json(), { message: '用户更新成功', idempotent_replay: true });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(profileReplaySocket.connected, true, 'a profile-only replay does not disconnect the user socket');

  const deleteTargetId = await executeInsert(
    'INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,0)',
    ['revocation-delete-target', 'unused', 'member', 'Delete target', 1],
  );
  const deleteSessionId = await sessions.createSession({ userId: deleteTargetId, clientType: 'web' });
  deleteSocket = connect(base, { auth: { token: signToken({ userId: deleteTargetId }) }, transports: ['websocket'], reconnection: false });
  await waitFor(deleteSocket, 'connect');
  const deleteDisconnected = waitFor(deleteSocket, 'disconnect');
  const deleteRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57';
  const deleteResponse = await fetch(`${base}/api/users/${deleteTargetId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' },
    body: JSON.stringify({ client_request_id: deleteRequestId }),
  });
  assert.equal(deleteResponse.status, 200, 'a user delete succeeds with an idempotency key');
  await deleteDisconnected;
  assert.deepEqual(await deleteResponse.json(), { message: '用户删除成功', idempotent_replay: false });
  assert.equal((await sessions.getSession(deleteSessionId)).state, 'NOT_FOUND', 'deleting the account cascades its persisted session');
  assert.equal(await queryOne('SELECT id FROM users WHERE id=?', [deleteTargetId]), null);

  const replayTargetId = await executeInsert(
    'INSERT INTO users(username,password,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,0)',
    ['revocation-delete-replay-target', 'unused', 'member', 'Delete replay target', 1],
  );
  const replaySessionId = await sessions.createSession({ userId: replayTargetId, clientType: 'web' });
  replaySocket = connect(base, { auth: { token: signToken({ userId: replayTargetId }) }, transports: ['websocket'], reconnection: false });
  await waitFor(replaySocket, 'connect');
  const replayRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a58';
  const replayFingerprint = createHmac('sha256', process.env.JWT_SECRET!)
    .update(JSON.stringify(['delete-user', replayTargetId]))
    .digest('hex');
  // Model a previous process that committed the delete and request tombstone
  // but exited before it could disconnect its live Socket.IO connection.
  await execute('DELETE FROM users WHERE id=?', [replayTargetId]);
  await execute(
    `INSERT INTO user_delete_request_keys(client_request_id,actor_id,target_user_id,request_fingerprint,created_at)
     VALUES(?,?,?,?, '2026-10-22 10:00:00')`,
    [replayRequestId, adminId, replayTargetId, replayFingerprint],
  );
  const replayDisconnected = waitFor(replaySocket, 'disconnect');
  const replayResponse = await fetch(`${base}/api/users/${replayTargetId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${signToken({ userId: adminId })}`, 'content-type': 'application/json' },
    body: JSON.stringify({ client_request_id: replayRequestId }),
  });
  assert.equal(replayResponse.status, 200, 'a persisted delete can be replayed after the original response was lost');
  await replayDisconnected;
  assert.deepEqual(await replayResponse.json(), { message: '用户删除成功', idempotent_replay: true });
  assert.equal((await sessions.getSession(replaySessionId)).state, 'NOT_FOUND', 'the replay leaves the deleted account session absent');
} finally { socket?.disconnect(); deleteSocket?.disconnect(); replaySocket?.disconnect(); updateReplaySocket?.disconnect(); profileReplaySocket?.disconnect(); await new Promise<void>((resolve) => io.close(() => resolve())); if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve())); await closeDatabase(); }
console.log('User session and socket revocation tests passed');
