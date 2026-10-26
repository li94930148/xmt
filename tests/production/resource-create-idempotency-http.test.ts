import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-create-idempotency-http-'));
process.env.XMT_DB_PATH = path.join(directory, 'resources.db');
process.env.JWT_SECRET = 'resource-create-idempotency-http-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: routes } = await import('../../api/routes/resource-center.js');
const { generateOpenApiDocument } = await import('../../api/openapi.js');

await initDatabase();
const createAdmin = async (username: string) => {
  const userId = await executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password)
     VALUES(?,?,?,?,?,1,0)`,
    [username, 'unused', `${username}@example.invalid`, 'admin', username],
  );
  await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [userId, 'admin']);
  return userId;
};
const actorId = await createAdmin('resource-create-http-owner');
const otherActorId = await createAdmin('resource-create-http-other');
const noPermissionId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password)
   VALUES(?,?,?,?,?,1,0)`,
  ['resource-create-http-denied', 'unused', 'resource-create-http-denied@example.invalid', 'member', '无创建权限'],
);

const app = express();
app.use(express.json());
app.use('/api/resource-center', routes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/resource-center`;
const headersFor = (userId: number) => ({
  Authorization: `Bearer ${signToken({ userId })}`,
  'Content-Type': 'application/json',
});
const payload = {
  title: 'HTTP 隔离资料创建恢复',
  summary: '服务端回执验收',
  library_type: 'knowledge',
  visibility: 'team',
  content_text: '仅存在于临时 SQLite 数据库',
};
const requestId = '61e33e45-2db0-4e0e-87f3-84a84d2b2045';

try {
  const firstResponse = await fetch(`${base}/resources`, {
    method: 'POST', headers: headersFor(actorId),
    body: JSON.stringify({ ...payload, client_request_id: requestId }),
  });
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json() as { message: string; id: number };
  assert.equal(first.message, '资料创建成功');
  assert.ok(Number.isSafeInteger(first.id) && first.id > 0);
  assert.deepEqual(Object.keys(first).sort(), ['id', 'message'], 'keyed responses retain the original response shape');

  const duplicateResponse = await fetch(`${base}/resources`, {
    method: 'POST', headers: headersFor(actorId),
    body: JSON.stringify({ ...payload, client_request_id: requestId }),
  });
  assert.equal(duplicateResponse.status, 200, 'same actor and payload replay the committed resource');
  assert.deepEqual(await duplicateResponse.json(), first);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources'))?.count ?? 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE action='create'"))?.count ?? 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_create_request_keys'))?.count ?? 0), 1);

  const statusResponse = await fetch(`${base}/resources/create-requests/${requestId}`, { headers: headersFor(actorId) });
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await statusResponse.json(), { state: 'created', resourceId: first.id });

  const otherActorStatus = await fetch(`${base}/resources/create-requests/${requestId}`, { headers: headersFor(otherActorId) });
  assert.equal(otherActorStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await otherActorStatus.json(), { state: 'not_found' }, 'other actors receive no existence or ID signal');

  const unknownRequestId = '61e33e45-2db0-4e0e-87f3-84a84d2b2046';
  const missingStatus = await fetch(`${base}/resources/create-requests/${unknownRequestId}`, { headers: headersFor(actorId) });
  assert.deepEqual(await missingStatus.json(), { state: 'not_found' });
  const invalidStatus = await fetch(`${base}/resources/create-requests/not-a-uuid`, { headers: headersFor(actorId) });
  assert.equal(invalidStatus.status, 400);
  assert.equal(invalidStatus.headers.get('cache-control'), 'no-store');

  const mismatchedPayload = await fetch(`${base}/resources`, {
    method: 'POST', headers: headersFor(actorId),
    body: JSON.stringify({ ...payload, title: '不得复用不同内容', client_request_id: requestId }),
  });
  assert.equal(mismatchedPayload.status, 409);
  assert.equal((await mismatchedPayload.json()).code, 'RESOURCE_CREATE_REQUEST_CONFLICT');
  const mismatchedActor = await fetch(`${base}/resources`, {
    method: 'POST', headers: headersFor(otherActorId),
    body: JSON.stringify({ ...payload, client_request_id: requestId }),
  });
  assert.equal(mismatchedActor.status, 409);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources'))?.count ?? 0), 1);

  const invalidRequestId = await fetch(`${base}/resources`, {
    method: 'POST', headers: headersFor(actorId),
    body: JSON.stringify({ ...payload, client_request_id: 'not-a-uuid' }),
  });
  assert.equal(invalidRequestId.status, 400);
  const invalidFields = await fetch(`${base}/resources`, {
    method: 'POST', headers: headersFor(actorId),
    body: JSON.stringify({ ...payload, title: '   ', client_request_id: '61e33e45-2db0-4e0e-87f3-84a84d2b2047' }),
  });
  assert.equal(invalidFields.status, 400, 'invalid fields are rejected before a create receipt is recorded');
  const deniedCreate = await fetch(`${base}/resources`, {
    method: 'POST', headers: headersFor(noPermissionId),
    body: JSON.stringify({ ...payload, client_request_id: '61e33e45-2db0-4e0e-87f3-84a84d2b2048' }),
  });
  assert.equal(deniedCreate.status, 403, 'the existing resource:create permission gate remains in force');
  const unauthenticatedCreate = await fetch(`${base}/resources`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, client_request_id: '61e33e45-2db0-4e0e-87f3-84a84d2b2049' }),
  });
  assert.equal(unauthenticatedCreate.status, 401);

  const legacyResponse = await fetch(`${base}/resources`, {
    method: 'POST', headers: headersFor(actorId),
    body: JSON.stringify({ ...payload, title: '兼容旧客户端创建' }),
  });
  assert.equal(legacyResponse.status, 201, 'unkeyed legacy clients preserve the original create contract');
  assert.deepEqual(Object.keys(await legacyResponse.json()).sort(), ['id', 'message']);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resources'))?.count ?? 0), 2);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_create_request_keys'))?.count ?? 0), 1, 'legacy creates do not require or create a receipt');

  const unauthenticatedStatus = await fetch(`${base}/resources/create-requests/${requestId}`);
  assert.equal(unauthenticatedStatus.status, 401);
  assert.equal(unauthenticatedStatus.headers.get('cache-control'), 'no-store', 'the no-store header is applied before authentication');

  const document = generateOpenApiDocument();
  assert.ok(document.paths['/api/resource-center/resources']?.post, 'OpenAPI documents resource creation');
  assert.ok(document.paths['/api/resource-center/resources/create-requests/{requestId}']?.get, 'OpenAPI documents the read-only status endpoint');
  console.log('Resource create idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
