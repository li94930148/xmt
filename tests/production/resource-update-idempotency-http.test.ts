import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-update-idempotency-http-'));
process.env.XMT_DB_PATH = path.join(directory, 'resources.db');
process.env.JWT_SECRET = 'resource-update-idempotency-http-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { createResourceRecord } = await import('../../api/services/resourceCenter.js');
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
const actorId = await createAdmin('resource-update-http-owner');
const otherActorId = await createAdmin('resource-update-http-other');
const noPermissionId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password)
   VALUES(?,?,?,?,?,1,0)`,
  ['resource-update-http-denied', 'unused', 'resource-update-http-denied@example.invalid', 'member', '无更新权限'],
);
const outOfScopeEditorId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password)
   VALUES(?,?,?,?,?,1,0)`,
  ['resource-update-http-out-of-scope', 'unused', 'resource-update-http-out-of-scope@example.invalid', 'editor', '范围外编辑者'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [outOfScopeEditorId, 'editor']);

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
const resourceFields = {
  title: '更新前资料',
  summary: '旧摘要',
  library_type: 'knowledge',
  category_id: null,
  visibility: 'team',
  content_text: '仅存在于临时 SQLite 数据库的旧正文',
  source_type: 'manual',
  source_uri: null,
};

try {
  const resourceId = await createResourceRecord(resourceFields, actorId);
  const secondResourceId = await createResourceRecord({ ...resourceFields, title: '另一条资料' }, actorId);
  const categoryId = await executeInsert(
    `INSERT INTO resource_categories(library_type,name,code,path,created_by)
     VALUES(?,?,?,?,?)`,
    ['knowledge', '回执分类', 'resource-update-receipt', '回执分类', actorId],
  );
  const tagId = await executeInsert(
    'INSERT INTO resource_tags(name,normalized_name,created_by) VALUES(?,?,?)',
    ['HTTP隔离标签', 'http隔离标签', actorId],
  );
  const requestId = 'd350f580-7877-492f-9b70-a3f8e1ca9f05';
  const payload = {
    title: 'HTTP 更新后的资料',
    summary: 'HTTP 新摘要',
    category_id: categoryId,
    visibility: 'private',
    content_text: '仅写入临时 SQLite 数据库的新正文',
    tag_ids: [tagId],
    client_request_id: requestId,
  };

  const firstResponse = await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: headersFor(actorId), body: JSON.stringify(payload),
  });
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.deepEqual(first, { message: '资料更新成功' });

  await execute('UPDATE resource_categories SET enabled=0 WHERE id=?', [categoryId]);

  const replayResponse = await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: headersFor(actorId), body: JSON.stringify(payload),
  });
  assert.equal(replayResponse.status, 200, 'same actor/resource/key/payload replay preserves the PUT contract');
  assert.deepEqual(await replayResponse.json(), first);
  assert.equal((await queryOne<{ category_id: number }>('SELECT category_id FROM resources WHERE id=?', [resourceId]))?.category_id, categoryId, 'the original update remains committed after its category is disabled');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='update'", [resourceId]))?.count ?? 0), 1, 'replay does not duplicate audit records');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_tag_relations WHERE resource_id=?', [resourceId]))?.count ?? 0), 1, 'replay does not duplicate tag relations');

  const invalidNewRequest = await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: headersFor(actorId), body: JSON.stringify({
      title: '新请求不能复用失效分类',
      category_id: categoryId,
      client_request_id: 'c2d2d251-66df-438b-94f6-0524f21695c2',
    }),
  });
  assert.equal(invalidNewRequest.status, 400, 'a new keyed update still rejects a disabled category');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='update'", [resourceId]))?.count ?? 0), 1, 'invalid new request does not add an audit record');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_update_request_keys'))?.count ?? 0), 1, 'invalid new request does not create a receipt');

  const invalidLegacyCategory = await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: headersFor(actorId), body: JSON.stringify({ category_id: categoryId }),
  });
  assert.equal(invalidLegacyCategory.status, 400, 'legacy updates retain the category validation response');

  const statusResponse = await fetch(`${base}/resources/${resourceId}/update-requests/${requestId}`, { headers: headersFor(actorId) });
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await statusResponse.json(), { state: 'updated', resourceId });

  const otherActorStatus = await fetch(`${base}/resources/${resourceId}/update-requests/${requestId}`, { headers: headersFor(otherActorId) });
  assert.equal(otherActorStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await otherActorStatus.json(), { state: 'not_found' }, 'other actors receive no existence or ID signal');
  const readOnlyActorStatus = await fetch(`${base}/resources/${resourceId}/update-requests/${requestId}`, { headers: headersFor(noPermissionId) });
  assert.equal(readOnlyActorStatus.status, 200, 'the status endpoint requires authentication but does not grant or require resource:update');
  assert.deepEqual(await readOnlyActorStatus.json(), { state: 'not_found' });
  const otherResourceStatus = await fetch(`${base}/resources/${secondResourceId}/update-requests/${requestId}`, { headers: headersFor(actorId) });
  assert.deepEqual(await otherResourceStatus.json(), { state: 'not_found' }, 'status is scoped to the requested resource');
  const unknownRequestId = 'd350f580-7877-492f-9b70-a3f8e1ca9f06';
  const missingStatus = await fetch(`${base}/resources/${resourceId}/update-requests/${unknownRequestId}`, { headers: headersFor(actorId) });
  assert.deepEqual(await missingStatus.json(), { state: 'not_found' });
  const invalidStatus = await fetch(`${base}/resources/${resourceId}/update-requests/not-a-uuid`, { headers: headersFor(actorId) });
  assert.equal(invalidStatus.status, 400);
  assert.equal(invalidStatus.headers.get('cache-control'), 'no-store');

  const mismatchedPayload = await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: headersFor(actorId), body: JSON.stringify({ ...payload, title: '不得复用不同内容' }),
  });
  assert.equal(mismatchedPayload.status, 409);
  assert.equal((await mismatchedPayload.json()).code, 'RESOURCE_UPDATE_REQUEST_CONFLICT');
  const mismatchedActor = await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: headersFor(otherActorId), body: JSON.stringify(payload),
  });
  assert.equal(mismatchedActor.status, 409);
  const mismatchedResource = await fetch(`${base}/resources/${secondResourceId}`, {
    method: 'PUT', headers: headersFor(actorId), body: JSON.stringify(payload),
  });
  assert.equal(mismatchedResource.status, 409);
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE action='update'"))?.count ?? 0), 1, 'conflicting key reuse never applies a second update');

  const invalidRequestId = await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: headersFor(actorId), body: JSON.stringify({ ...payload, client_request_id: 'not-a-uuid' }),
  });
  assert.equal(invalidRequestId.status, 400);
  const deniedUpdate = await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: headersFor(noPermissionId), body: JSON.stringify({ title: '无权限不可更新' }),
  });
  assert.equal(deniedUpdate.status, 403, 'the existing update permission gate remains in force');

  const outOfScopeRequestId = '5ad2ae77-3de0-4fea-888a-e9ad81794072';
  const outOfScopeAuditCount = Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='update'", [secondResourceId]))?.count ?? 0);
  const outOfScopeUpdate = await fetch(`${base}/resources/${secondResourceId}`, {
    method: 'PUT',
    headers: headersFor(outOfScopeEditorId),
    body: JSON.stringify({ title: '范围外不得修改', client_request_id: outOfScopeRequestId }),
  });
  assert.equal(outOfScopeUpdate.status, 403, 'a user with resource:update but no ownership/editor scope remains forbidden');
  assert.equal((await queryOne<{ title: string }>('SELECT title FROM resources WHERE id=?', [secondResourceId]))?.title, '另一条资料', 'out-of-scope update leaves the resource unchanged');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_audit_logs WHERE resource_id=? AND action='update'", [secondResourceId]))?.count ?? 0), outOfScopeAuditCount, 'out-of-scope update writes no audit row');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_update_request_keys WHERE client_request_id=?', [outOfScopeRequestId]))?.count ?? 0), 0, 'out-of-scope update creates no receipt');

  const unauthenticatedStatus = await fetch(`${base}/resources/${resourceId}/update-requests/${requestId}`);
  assert.equal(unauthenticatedStatus.status, 401);
  assert.equal(unauthenticatedStatus.headers.get('cache-control'), 'no-store', 'no-store applies before authentication');

  const legacyResponse = await fetch(`${base}/resources/${resourceId}`, {
    method: 'PUT', headers: headersFor(actorId), body: JSON.stringify({ title: '旧客户端无请求编号' }),
  });
  assert.equal(legacyResponse.status, 200, 'legacy clients remain compatible without a request key');
  assert.deepEqual(await legacyResponse.json(), { message: '资料更新成功' });
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_update_request_keys'))?.count ?? 0), 1, 'legacy updates do not create receipts');

  const document = generateOpenApiDocument();
  assert.ok(document.paths['/api/resource-center/resources/{id}']?.put, 'OpenAPI documents keyed and legacy resource updates');
  assert.ok(document.paths['/api/resource-center/resources/{id}/update-requests/{requestId}']?.get, 'OpenAPI documents the read-only update status endpoint');
  console.log('Resource update idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
