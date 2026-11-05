import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-user-audit-atomic-'));
process.env.XMT_DB_PATH = path.join(directory, 'user-audit-atomic.db');
process.env.JWT_SECRET = 'user-audit-atomic-isolated-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { default: routes } = await import('../../api/routes/users.js');
const { signToken } = await import('../../api/utils/jwt.js');

await initDatabase();
const adminId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['user-audit-admin', 'unused', 'user-audit@example.invalid', 'admin', '隔离用户管理员'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
clearPermissionCache();

const targetId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['user-audit-target', 'unused', 'target@example.invalid', 'member', '原用户名称'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [targetId, 'member']);
const otherAdminId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['user-audit-other-admin', 'unused', 'other-admin@example.invalid', 'admin', '另一隔离管理员'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [otherAdminId, 'admin']);
clearPermissionCache();

const app = express();
app.use(express.json());
let loseNextUserUpdateResponse = false;
let loseNextUserCreateResponse = false;
let loseNextUserDeleteResponse = false;
app.use('/api/users', (req, res, next) => {
  if (req.method === 'PUT' || req.method === 'POST' || req.method === 'DELETE') {
    const sendJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if ((req.method === 'PUT' && loseNextUserUpdateResponse && req.path === `/${targetId}`)
        || (req.method === 'POST' && loseNextUserCreateResponse && req.path === '/')
        || (req.method === 'DELETE' && loseNextUserDeleteResponse && req.path !== '/')) {
        if (req.method === 'PUT') loseNextUserUpdateResponse = false;
        else if (req.method === 'POST') loseNextUserCreateResponse = false;
        else loseNextUserDeleteResponse = false;
        res.statusCode = 503;
      }
      return sendJson(body);
    }) as typeof res.json;
  }
  next();
});
app.use('/api/users', routes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/users`;
const headers = {
  Authorization: `Bearer ${signToken({ userId: adminId })}`,
  'Content-Type': 'application/json',
};
const otherAdminHeaders = {
  Authorization: `Bearer ${signToken({ userId: otherAdminId })}`,
  'Content-Type': 'application/json',
};

async function createUser(username: string, clientRequestId?: string) {
  return fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password: 'isolated-password', email: `${username}@example.invalid`, role: 'member', name: '隔离新用户', ...(clientRequestId ? { client_request_id: clientRequestId } : {}) }),
  });
}

async function countActivity(action: string, detailLike: string) {
  return Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM activity_log WHERE user_id=? AND action=? AND target=? AND detail LIKE ?',
    [adminId, action, 'user', detailLike],
  ))?.count || 0);
}

function assertNoStore(response: Response, context: string) {
  assert.equal(response.headers.get('Cache-Control'), 'no-store', `${context} must not be cached`);
}

try {
  await execute(`
    CREATE TRIGGER reject_user_create_audit
    BEFORE INSERT ON activity_log
    WHEN NEW.action='create' AND NEW.target='user'
    BEGIN SELECT RAISE(ABORT, 'simulated user create audit failure'); END
  `);
  const failedCreate = await createUser('user-audit-created');
  assert.equal(failedCreate.status, 500, 'a failed create audit fails the user create request');
  assert.deepEqual(await failedCreate.json(), { message: '创建用户失败' }, 'SQLite error text is not returned to callers');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE username='user-audit-created'"))?.count || 0), 0);
  assert.equal(await countActivity('create', '%user-audit-created%'), 0);

  await execute('DROP TRIGGER reject_user_create_audit');
  const created = await createUser('user-audit-created');
  assert.equal(created.status, 200, 'the same create succeeds once the audit store recovers');
  const createdBody = await created.json() as { userId: number };
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE username='user-audit-created'"))?.count || 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=?', [createdBody.userId]))?.count || 0), 1);
  assert.equal(await countActivity('create', '%user-audit-created%'), 1);

  const createReplayRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a53';
  const createReplayBody = {
    username: 'user-audit-idempotent-created',
    password: 'isolated-create-reset-password',
    email: 'idempotent-create@example.invalid',
    role: 'member',
    name: '需重试新用户',
    client_request_id: createReplayRequestId,
  };
  loseNextUserCreateResponse = true;
  const committedButUnconfirmedCreate = await fetch(base, {
    method: 'POST', headers, body: JSON.stringify(createReplayBody),
  });
  assert.equal(committedButUnconfirmedCreate.status, 503, 'simulate response loss after the user-create transaction commits');
  const createdForReplay = await queryOne<{ id: number; username: string }>(
    'SELECT id,username FROM users WHERE username=?',
    [createReplayBody.username],
  );
  assert.ok(createdForReplay?.id);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE username=?', [createReplayBody.username]))?.count || 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=?', [createdForReplay?.id]))?.count || 0), 1);
  assert.equal(await countActivity('create', `%${createReplayBody.username}%`), 1);
  const createFingerprint = await queryOne<{ request_fingerprint: string }>(
    'SELECT request_fingerprint FROM user_create_request_keys WHERE client_request_id=?',
    [createReplayRequestId],
  );
  assert.match(createFingerprint?.request_fingerprint || '', /^[0-9a-f]{64}$/);
  assert.equal(createFingerprint?.request_fingerprint.includes(createReplayBody.password), false, 'the create ledger stores an HMAC fingerprint rather than the raw password');

  const confirmedCreateStatus = await fetch(`${base}/create-requests/${createReplayRequestId}`, { headers });
  assert.equal(confirmedCreateStatus.status, 200);
  assertNoStore(confirmedCreateStatus, 'confirmed user-create status');
  assert.deepEqual(await confirmedCreateStatus.json(), { state: 'created', userId: Number(createdForReplay?.id) });
  const hiddenCreateStatus = await fetch(`${base}/create-requests/${createReplayRequestId}`, { headers: otherAdminHeaders });
  assert.equal(hiddenCreateStatus.status, 200);
  assertNoStore(hiddenCreateStatus, 'owner-scoped user-create not-found status');
  assert.deepEqual(await hiddenCreateStatus.json(), { state: 'not_found' }, 'a different creator cannot discover another actor\'s request result');
  const adminRole = await queryOne<{ id: number }>(`SELECT id FROM roles WHERE code='admin'`);
  const userCreatePermission = await queryOne<{ id: number }>(`SELECT id FROM permissions WHERE code='user:create'`);
  assert.ok(adminRole?.id && userCreatePermission?.id, 'the isolated permission fixture is available');
  await execute('DELETE FROM role_permissions WHERE role_id=? AND permission_id=?', [adminRole.id, userCreatePermission.id]);
  clearPermissionCache();
  const createStatusWithoutWritePermission = await fetch(`${base}/create-requests/${createReplayRequestId}`, { headers });
  assert.equal(createStatusWithoutWritePermission.status, 200, 'the original creator can perform read-only recovery after user:create is revoked');
  assertNoStore(createStatusWithoutWritePermission, 'user-create status after permission revocation');
  assert.deepEqual(await createStatusWithoutWritePermission.json(), { state: 'created', userId: Number(createdForReplay?.id) });
  const deniedCreateAfterRevocation = await createUser('user-audit-create-after-revocation');
  assert.equal(deniedCreateAfterRevocation.status, 403, 'removing user:create still blocks new user creation');
  await execute(
    'INSERT OR IGNORE INTO role_permissions(role_id,permission_id) VALUES(?,?)',
    [adminRole.id, userCreatePermission.id],
  );
  clearPermissionCache();
  const missingCreateStatus = await fetch(`${base}/create-requests/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, { headers });
  assert.equal(missingCreateStatus.status, 200);
  assertNoStore(missingCreateStatus, 'missing user-create status');
  assert.deepEqual(await missingCreateStatus.json(), { state: 'not_found' });
  const invalidCreateStatus = await fetch(`${base}/create-requests/not-a-request-id`, { headers });
  assert.equal(invalidCreateStatus.status, 400, 'malformed request ids are rejected');
  assertNoStore(invalidCreateStatus, 'invalid user-create status');
  const unauthenticatedCreateStatus = await fetch(`${base}/create-requests/${createReplayRequestId}`);
  assert.equal(unauthenticatedCreateStatus.status, 401, 'create status still requires authentication');
  assertNoStore(unauthenticatedCreateStatus, 'unauthenticated user-create status');

  const replayedCreate = await fetch(base, {
    method: 'POST', headers, body: JSON.stringify(createReplayBody),
  });
  assert.equal(replayedCreate.status, 200);
  assert.deepEqual(await replayedCreate.json(), {
    message: '用户创建成功',
    userId: Number(createdForReplay?.id),
    idempotent_replay: true,
  });
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE username=?', [createReplayBody.username]))?.count || 0), 1,
    'replaying a committed user create does not create a second account');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=?', [createdForReplay?.id]))?.count || 0), 1,
    'replaying a committed user create does not duplicate role membership');
  assert.equal(await countActivity('create', `%${createReplayBody.username}%`), 1,
    'replaying a committed user create does not duplicate the activity entry');

  const conflictingCreate = await fetch(base, {
    method: 'POST', headers,
    body: JSON.stringify({ ...createReplayBody, name: '不得覆盖', client_request_id: createReplayRequestId }),
  });
  assert.equal(conflictingCreate.status, 409, 'the same create key cannot be rebound to different account details');
  assert.equal((await queryOne<{ name: string }>('SELECT name FROM users WHERE id=?', [createdForReplay?.id]))?.name, '需重试新用户');
  assert.equal(await countActivity('create', `%${createReplayBody.username}%`), 1);

  await execute(`
    CREATE TRIGGER reject_user_update_audit
    BEFORE INSERT ON activity_log
    WHEN NEW.action='update' AND NEW.target='user'
    BEGIN SELECT RAISE(ABORT, 'simulated user update audit failure'); END
  `);
  const failedUpdate = await fetch(`${base}/${targetId}`, {
    method: 'PUT', headers, body: JSON.stringify({ name: '不应保存的名称', role: 'director' }),
  });
  assert.equal(failedUpdate.status, 500, 'a failed update audit fails the user update request');
  assert.deepEqual(await failedUpdate.json(), { message: '更新用户失败' }, 'SQLite error text is not returned to callers');
  assert.deepEqual(
    await queryOne<{ name: string; role: string }>('SELECT name,role FROM users WHERE id=?', [targetId]),
    { name: '原用户名称', role: 'member' },
    'user and role changes roll back when the audit insert fails',
  );
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=? AND role_id=(SELECT id FROM roles WHERE code=?)', [targetId, 'member']))?.count || 0), 1);
  assert.equal(await countActivity('update', '%user-audit-target%'), 0);

  await execute('DROP TRIGGER reject_user_update_audit');
  const updated = await fetch(`${base}/${targetId}`, {
    method: 'PUT', headers, body: JSON.stringify({ name: '更新后的名称', role: 'director' }),
  });
  assert.equal(updated.status, 200, 'the update succeeds once the audit store recovers');
  assert.deepEqual(await queryOne<{ name: string; role: string }>('SELECT name,role FROM users WHERE id=?', [targetId]), { name: '更新后的名称', role: 'director' });
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=? AND role_id=(SELECT id FROM roles WHERE code=?)', [targetId, 'director']))?.count || 0), 1);
  assert.equal(await countActivity('update', '%user-audit-target%'), 1);

  const userBeforeRetry = await queryOne<{ auth_version: number }>('SELECT auth_version FROM users WHERE id=?', [targetId]);
  await execute(`INSERT INTO auth_sessions(id,user_id,client_type,created_at,last_seen_at,idle_expires_at,absolute_expires_at)
    VALUES('user-update-idempotency-session',?,'web','2026-10-22 10:00:00','2026-10-22 10:00:00','2026-10-23 10:00:00','2026-11-22 10:00:00')`, [targetId]);
  const replayRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a51';
  const replayBody = {
    password: 'isolated-reset-password',
    email: 'replayed-update@example.invalid',
    role: 'camera',
    name: '重放确认用户',
    enabled: false,
    client_request_id: replayRequestId,
  };
  loseNextUserUpdateResponse = true;
  const committedButUnconfirmedUpdate = await fetch(`${base}/${targetId}`, {
    method: 'PUT', headers, body: JSON.stringify(replayBody),
  });
  assert.equal(committedButUnconfirmedUpdate.status, 503, 'simulate a response loss after the update transaction has committed');
  const confirmedUpdateStatus = await fetch(`${base}/update-requests/${replayRequestId}/${targetId}`, { headers });
  assert.equal(confirmedUpdateStatus.status, 200);
  assertNoStore(confirmedUpdateStatus, 'confirmed user-update status');
  assert.deepEqual(await confirmedUpdateStatus.json(), { state: 'updated' }, 'the request actor can verify the committed update without reading profile data');
  const hiddenUpdateStatus = await fetch(`${base}/update-requests/${replayRequestId}/${targetId}`, { headers: otherAdminHeaders });
  assert.equal(hiddenUpdateStatus.status, 200);
  assertNoStore(hiddenUpdateStatus, 'actor-scoped user-update not-found status');
  assert.deepEqual(await hiddenUpdateStatus.json(), { state: 'not_found' }, 'a different actor cannot discover another actor update');
  const wrongTargetUpdateStatus = await fetch(`${base}/update-requests/${replayRequestId}/${otherAdminId}`, { headers });
  assert.equal(wrongTargetUpdateStatus.status, 200);
  assertNoStore(wrongTargetUpdateStatus, 'wrong-target user-update not-found status');
  assert.deepEqual(await wrongTargetUpdateStatus.json(), { state: 'not_found' }, 'a mismatched target is indistinguishable from a missing request');
  const missingUpdateStatus = await fetch(`${base}/update-requests/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${targetId}`, { headers });
  assert.equal(missingUpdateStatus.status, 200);
  assertNoStore(missingUpdateStatus, 'missing user-update status');
  assert.deepEqual(await missingUpdateStatus.json(), { state: 'not_found' });
  const malformedUpdateStatus = await fetch(`${base}/update-requests/not-a-request-id/${targetId}`, { headers });
  assert.equal(malformedUpdateStatus.status, 400, 'malformed update request ids are rejected');
  assertNoStore(malformedUpdateStatus, 'invalid user-update status');
  const unauthenticatedUpdateStatus = await fetch(`${base}/update-requests/${replayRequestId}/${targetId}`);
  assert.equal(unauthenticatedUpdateStatus.status, 401, 'update status still requires authentication');
  assertNoStore(unauthenticatedUpdateStatus, 'unauthenticated user-update status');

  const statusOnlyActorId = await executeInsert(
    'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
    ['user-update-status-reader', 'unused', 'status-reader@example.invalid', 'member', '只读状态查询账号'],
  );
  await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [statusOnlyActorId, 'member']);
  clearPermissionCache();
  const statusOnlyRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a52';
  await execute(
    'INSERT INTO user_update_request_keys(client_request_id,actor_id,target_user_id,request_fingerprint,created_at) VALUES(?,?,?,?,?)',
    [statusOnlyRequestId, statusOnlyActorId, targetId, 'isolated-test-fingerprint', '2026-10-22 10:00:00'],
  );
  const statusOnlyHeaders = { Authorization: `Bearer ${signToken({ userId: statusOnlyActorId })}` };
  const statusWithoutUpdatePermission = await fetch(`${base}/update-requests/${statusOnlyRequestId}/${targetId}`, { headers: statusOnlyHeaders });
  assert.equal(statusWithoutUpdatePermission.status, 200, 'an authenticated actor can recover their own request after losing user:update');
  assertNoStore(statusWithoutUpdatePermission, 'user-update status after permission loss');
  assert.deepEqual(await statusWithoutUpdatePermission.json(), { state: 'updated' });

  const selfDisable = await fetch(`${base}/${adminId}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ enabled: false, client_request_id: 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a54' }),
  });
  assert.equal(selfDisable.status, 400, 'an actor cannot disable their own account and lose the only recovery session');
  assert.equal(Number((await queryOne<{ enabled: number }>('SELECT enabled FROM users WHERE id=?', [adminId]))?.enabled), 1);
  assert.deepEqual(
    await queryOne<{ name: string; role: string; enabled: number; auth_version: number }>('SELECT name,role,enabled,auth_version FROM users WHERE id=?', [targetId]),
    { name: '重放确认用户', role: 'camera', enabled: 0, auth_version: Number(userBeforeRetry?.auth_version) + 1 },
  );
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM auth_sessions WHERE id='user-update-idempotency-session' AND revoked_at IS NOT NULL AND revoke_reason='user_disabled'"))?.count || 0), 1);
  assert.equal(await countActivity('update', '%user-audit-target%'), 2);
  const storedFingerprint = await queryOne<{ request_fingerprint: string }>(
    'SELECT request_fingerprint FROM user_update_request_keys WHERE client_request_id=?',
    [replayRequestId],
  );
  assert.match(storedFingerprint?.request_fingerprint || '', /^[0-9a-f]{64}$/);
  assert.equal(storedFingerprint?.request_fingerprint.includes(replayBody.password), false, 'the request ledger stores an HMAC fingerprint rather than the raw password');

  const replayedUpdate = await fetch(`${base}/${targetId}`, {
    method: 'PUT', headers, body: JSON.stringify(replayBody),
  });
  assert.equal(replayedUpdate.status, 200);
  assert.deepEqual(await replayedUpdate.json(), { message: '用户更新成功', idempotent_replay: true });
  assert.equal(Number((await queryOne<{ auth_version: number }>('SELECT auth_version FROM users WHERE id=?', [targetId]))?.auth_version), Number(userBeforeRetry?.auth_version) + 1,
    'replaying a committed password/role update does not increment auth_version again');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM auth_sessions WHERE id='user-update-idempotency-session' AND revoked_at IS NOT NULL AND revoke_reason='user_disabled'"))?.count || 0), 1,
    'replay does not repeat session revocation');
  assert.equal(await countActivity('update', '%user-audit-target%'), 2, 'replay does not write a duplicate activity entry');

  const conflictingReplay = await fetch(`${base}/${targetId}`, {
    method: 'PUT', headers, body: JSON.stringify({ ...replayBody, name: '不应覆盖的用户', client_request_id: replayRequestId }),
  });
  assert.equal(conflictingReplay.status, 409, 'the same request key cannot be rebound to another user edit');
  assert.equal((await queryOne<{ name: string }>('SELECT name FROM users WHERE id=?', [targetId]))?.name, '重放确认用户');
  assert.equal(await countActivity('update', '%user-audit-target%'), 2);

  await execute(`
    CREATE TRIGGER reject_user_delete_audit
    BEFORE INSERT ON activity_log
    WHEN NEW.action='delete' AND NEW.target='user'
    BEGIN SELECT RAISE(ABORT, 'simulated user delete audit failure'); END
  `);
  const failedDelete = await fetch(`${base}/${targetId}`, { method: 'DELETE', headers });
  assert.equal(failedDelete.status, 500, 'a failed delete audit fails the user delete request');
  assert.deepEqual(await failedDelete.json(), { message: '删除用户失败' }, 'SQLite error text is not returned to callers');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE id=?', [targetId]))?.count || 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=?', [targetId]))?.count || 0), 1);
  assert.equal(await countActivity('delete', '%user-audit-target%'), 0);

  await execute('DROP TRIGGER reject_user_delete_audit');
  const deleted = await fetch(`${base}/${targetId}`, { method: 'DELETE', headers });
  assert.equal(deleted.status, 200, 'the delete succeeds once the audit store recovers');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE id=?', [targetId]))?.count || 0), 0);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=?', [targetId]))?.count || 0), 0);
  assert.equal(await countActivity('delete', '%user-audit-target%'), 1);

  const deleteReplayTargetId = await executeInsert(
    'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
    ['user-audit-delete-replay', 'unused', 'delete-replay@example.invalid', 'member', '删除重试目标'],
  );
  await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [deleteReplayTargetId, 'member']);
  const deleteReplayRequestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a56';
  loseNextUserDeleteResponse = true;
  const committedButUnconfirmedDelete = await fetch(`${base}/${deleteReplayTargetId}`, {
    method: 'DELETE', headers, body: JSON.stringify({ client_request_id: deleteReplayRequestId }),
  });
  assert.equal(committedButUnconfirmedDelete.status, 503, 'simulate response loss after the user-delete transaction commits');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM users WHERE id=?', [deleteReplayTargetId]))?.count || 0), 0);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM user_roles WHERE user_id=?', [deleteReplayTargetId]))?.count || 0), 0);
  assert.equal(await countActivity('delete', '%user-audit-delete-replay%'), 1, 'the delete and activity record commit together once');
  const storedDeleteFingerprint = await queryOne<{ request_fingerprint: string }>(
    'SELECT request_fingerprint FROM user_delete_request_keys WHERE client_request_id=?',
    [deleteReplayRequestId],
  );
  assert.match(storedDeleteFingerprint?.request_fingerprint || '', /^[0-9a-f]{64}$/);

  const confirmedDeleteStatus = await fetch(`${base}/delete-requests/${deleteReplayRequestId}/${deleteReplayTargetId}`, { headers });
  assert.equal(confirmedDeleteStatus.status, 200);
  assertNoStore(confirmedDeleteStatus, 'confirmed user-delete status');
  assert.deepEqual(await confirmedDeleteStatus.json(), { state: 'deleted' }, 'the original actor can verify deletion after its target is gone');
  const hiddenDeleteStatus = await fetch(`${base}/delete-requests/${deleteReplayRequestId}/${deleteReplayTargetId}`, { headers: otherAdminHeaders });
  assert.equal(hiddenDeleteStatus.status, 200);
  assertNoStore(hiddenDeleteStatus, 'actor-scoped user-delete not-found status');
  assert.deepEqual(await hiddenDeleteStatus.json(), { state: 'not_found' }, 'another actor cannot discover a delete request');
  const wrongTargetDeleteStatus = await fetch(`${base}/delete-requests/${deleteReplayRequestId}/${targetId}`, { headers });
  assert.equal(wrongTargetDeleteStatus.status, 200);
  assertNoStore(wrongTargetDeleteStatus, 'wrong-target user-delete not-found status');
  assert.deepEqual(await wrongTargetDeleteStatus.json(), { state: 'not_found' }, 'a mismatched target is indistinguishable from a missing delete request');
  const missingDeleteStatus = await fetch(`${base}/delete-requests/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${deleteReplayTargetId}`, { headers });
  assert.equal(missingDeleteStatus.status, 200);
  assertNoStore(missingDeleteStatus, 'missing user-delete status');
  assert.deepEqual(await missingDeleteStatus.json(), { state: 'not_found' });
  const malformedDeleteStatus = await fetch(`${base}/delete-requests/not-a-request-id/${deleteReplayTargetId}`, { headers });
  assert.equal(malformedDeleteStatus.status, 400, 'malformed delete request ids are rejected');
  assertNoStore(malformedDeleteStatus, 'invalid user-delete status');
  const unauthenticatedDeleteStatus = await fetch(`${base}/delete-requests/${deleteReplayRequestId}/${deleteReplayTargetId}`);
  assert.equal(unauthenticatedDeleteStatus.status, 401, 'delete status requires authentication');
  assertNoStore(unauthenticatedDeleteStatus, 'unauthenticated user-delete status');

  const replayedDelete = await fetch(`${base}/${deleteReplayTargetId}`, {
    method: 'DELETE', headers, body: JSON.stringify({ client_request_id: deleteReplayRequestId }),
  });
  assert.equal(replayedDelete.status, 200, 'the same delete request can be safely replayed after its response was lost');
  assert.deepEqual(await replayedDelete.json(), { message: '用户删除成功', idempotent_replay: true });
  assert.equal(await countActivity('delete', '%user-audit-delete-replay%'), 1, 'replaying the request does not duplicate the activity record');
  const conflictingDelete = await fetch(`${base}/${targetId}`, {
    method: 'DELETE', headers, body: JSON.stringify({ client_request_id: deleteReplayRequestId }),
  });
  assert.equal(conflictingDelete.status, 409, 'a delete request key cannot be rebound to a different target');
  const statusWithoutDeletePermission = await execute('DELETE FROM user_roles WHERE user_id=? AND role_id=(SELECT id FROM roles WHERE code=?)', [adminId, 'admin']);
  assert.equal(statusWithoutDeletePermission, 1);
  clearPermissionCache();
  const deleteStatusAfterPermissionLoss = await fetch(`${base}/delete-requests/${deleteReplayRequestId}/${deleteReplayTargetId}`, { headers });
  assert.equal(deleteStatusAfterPermissionLoss.status, 200, 'status recovery remains available after delete permission is removed');
  assertNoStore(deleteStatusAfterPermissionLoss, 'user-delete status after permission loss');
  assert.deepEqual(await deleteStatusAfterPermissionLoss.json(), { state: 'deleted' });

  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  console.log('user create/update/delete and activity audit transaction tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  clearPermissionCache();
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
