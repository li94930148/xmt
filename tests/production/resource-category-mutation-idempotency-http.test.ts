import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-resource-category-mutation-http-'));
process.env.XMT_DB_PATH = path.join(directory, 'resource-categories.db');
process.env.JWT_SECRET = 'resource-category-mutation-http-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: routes } = await import('../../api/routes/resource-center.js');

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
const actorId = await createAdmin('resource-category-mutation-owner');
const otherActorId = await createAdmin('resource-category-mutation-other');
const noPermissionId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password)
   VALUES(?,?,?,?,?,1,0)`,
  ['resource-category-mutation-denied', 'unused', 'resource-category-mutation-denied@example.invalid', 'member', '无分类管理权限'],
);

const app = express();
app.use(express.json());
app.use('/api/resource-center', routes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/resource-center`;
const headersFor = (userId: number) => ({ Authorization: `Bearer ${signToken({ userId })}`, 'Content-Type': 'application/json' });

try {
  const createId = 'f1c7f8a0-2b87-4782-a117-d81ed4c08d30';
  const createPayload = { library_type: 'knowledge', name: '幂等新增', parent_id: null, client_request_id: createId };
  const created = await fetch(`${base}/categories`, { method: 'POST', headers: headersFor(actorId), body: JSON.stringify(createPayload) });
  assert.equal(created.status, 201);
  const createdBody = await created.json() as { id: number };
  const replayedCreate = await fetch(`${base}/categories`, { method: 'POST', headers: headersFor(actorId), body: JSON.stringify(createPayload) });
  assert.equal(replayedCreate.status, 201, 'same create request replays the original successful contract');
  assert.deepEqual(await replayedCreate.json(), createdBody);
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM resource_categories WHERE name='幂等新增'"))?.count ?? 0), 1);
  const createStatus = await fetch(`${base}/categories/mutation-requests/${createId}?fingerprint=${'0'.repeat(64)}`, { headers: headersFor(actorId) });
  assert.equal(createStatus.headers.get('cache-control'), 'no-store');
  assert.equal(createStatus.status, 409, 'a mismatched request fingerprint is rejected');
  const { resourceCategoryMutationCanonicalRequest } = await import('../../shared/resource-category-mutation.js');
  const { createHash } = await import('node:crypto');
  const createFingerprint = createHash('sha256').update(resourceCategoryMutationCanonicalRequest('create', 'knowledge', null, { name: '幂等新增', parent_id: null })).digest('hex');
  const confirmedCreate = await fetch(`${base}/categories/mutation-requests/${createId}?fingerprint=${createFingerprint}`, { headers: headersFor(actorId) });
  assert.deepEqual(await confirmedCreate.json(), { state: 'created', categoryId: createdBody.id });
  const foreignStatus = await fetch(`${base}/categories/mutation-requests/${createId}?fingerprint=${createFingerprint}`, { headers: headersFor(otherActorId) });
  assert.deepEqual(await foreignStatus.json(), { state: 'not_found' }, 'another actor cannot inspect the receipt');
  const forbiddenStatus = await fetch(`${base}/categories/mutation-requests/${createId}?fingerprint=${createFingerprint}`, { headers: headersFor(noPermissionId) });
  assert.equal(forbiddenStatus.status, 403, 'the status endpoint requires category management permission');

  const conflictingCreate = await fetch(`${base}/categories`, { method: 'POST', headers: headersFor(actorId), body: JSON.stringify({ ...createPayload, name: '不同分类' }) });
  assert.equal(conflictingCreate.status, 409, 'a request ID reused with changed payload is rejected before a second insert');
  assert.equal((await conflictingCreate.json() as { code: string }).code, 'RESOURCE_CATEGORY_MUTATION_REQUEST_CONFLICT');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_category_mutation_request_keys WHERE client_request_id=?', [createId]))?.count ?? 0), 1);

  const parentId = await executeInsert(
    "INSERT INTO resource_categories(library_type,name,path,created_by) VALUES('knowledge','父分类','/父分类',?)",
    [actorId],
  );
  const updateId = 'f1c7f8a0-2b87-4782-a117-d81ed4c08d31';
  const updatePayload = { library_type: 'knowledge', name: '改名后分类', parent_id: parentId, client_request_id: updateId };
  const updated = await fetch(`${base}/categories/${createdBody.id}`, { method: 'PUT', headers: headersFor(actorId), body: JSON.stringify(updatePayload) });
  assert.equal(updated.status, 200);
  const replayedUpdate = await fetch(`${base}/categories/${createdBody.id}`, { method: 'PUT', headers: headersFor(actorId), body: JSON.stringify(updatePayload) });
  assert.equal(replayedUpdate.status, 200);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_category_mutation_request_keys WHERE client_request_id=?', [updateId]))?.count ?? 0), 1);
  assert.equal((await queryOne<{ path: string }>('SELECT path FROM resource_categories WHERE id=?', [createdBody.id]))?.path, '/父分类/改名后分类');
  const conflictingUpdate = await fetch(`${base}/categories/${createdBody.id}`, { method: 'PUT', headers: headersFor(actorId), body: JSON.stringify({ ...updatePayload, name: '另一个名字' }) });
  assert.equal(conflictingUpdate.status, 409);

  const malformedEnabled = await fetch(`${base}/categories/${createdBody.id}`, {
    method: 'PUT', headers: headersFor(actorId), body: JSON.stringify({ library_type: 'knowledge', enabled: 'false' }),
  });
  assert.equal(malformedEnabled.status, 400, 'enabled accepts only boolean or numeric 0/1');
  assert.equal((await queryOne<{ enabled: number }>('SELECT enabled FROM resource_categories WHERE id=?', [createdBody.id]))?.enabled, 1);

  const deleteId = 'f1c7f8a0-2b87-4782-a117-d81ed4c08d32';
  const deletePayload = { library_type: 'knowledge', client_request_id: deleteId };
  const deleted = await fetch(`${base}/categories/${createdBody.id}`, { method: 'DELETE', headers: headersFor(actorId), body: JSON.stringify(deletePayload) });
  assert.equal(deleted.status, 200);
  const replayedDelete = await fetch(`${base}/categories/${createdBody.id}`, { method: 'DELETE', headers: headersFor(actorId), body: JSON.stringify(deletePayload) });
  assert.equal(replayedDelete.status, 200, 'same delete request replays its receipt after the category row is gone');
  const deleteFingerprint = createHash('sha256').update(resourceCategoryMutationCanonicalRequest('delete', 'knowledge', createdBody.id, {})).digest('hex');
  const confirmedDelete = await fetch(`${base}/categories/mutation-requests/${deleteId}?fingerprint=${deleteFingerprint}`, { headers: headersFor(actorId) });
  assert.deepEqual(await confirmedDelete.json(), { state: 'deleted', categoryId: createdBody.id });

  const child = await executeInsert(
    'INSERT INTO resource_categories(library_type,parent_id,name,path,created_by) VALUES(\'knowledge\',?,?,?,?)',
    [parentId, '占用分类', '/父分类/占用分类', actorId],
  );
  const blockedDeleteId = 'f1c7f8a0-2b87-4782-a117-d81ed4c08d33';
  const blockedDelete = await fetch(`${base}/categories/${parentId}`, {
    method: 'DELETE', headers: headersFor(actorId), body: JSON.stringify({ library_type: 'knowledge', client_request_id: blockedDeleteId }),
  });
  assert.equal(blockedDelete.status, 409, 'categories with child categories remain undeletable');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_category_mutation_request_keys WHERE client_request_id=?', [blockedDeleteId]))?.count ?? 0), 0, 'rejected deletes do not create a success receipt');
  assert.equal((await queryOne<{ id: number }>('SELECT id FROM resource_categories WHERE id=?', [child]))?.id, child);

  const legacyId = await fetch(`${base}/categories`, {
    method: 'POST', headers: headersFor(actorId), body: JSON.stringify({ library_type: 'knowledge', name: '旧客户端分类' }),
  });
  assert.equal(legacyId.status, 201, 'legacy clients without request IDs remain compatible');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM resource_category_mutation_request_keys'))?.count ?? 0), 3, 'legacy requests do not create receipts');
  const invalidStatus = await fetch(`${base}/categories/mutation-requests/not-a-uuid?fingerprint=bad`, { headers: headersFor(actorId) });
  assert.equal(invalidStatus.status, 400);
  const unauthenticatedStatus = await fetch(`${base}/categories/mutation-requests/${createId}?fingerprint=${createFingerprint}`);
  assert.equal(unauthenticatedStatus.status, 401);
  console.log('Resource category mutation idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
