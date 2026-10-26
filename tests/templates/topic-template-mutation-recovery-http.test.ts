import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-topic-template-mutation-http-'));
process.env.XMT_DB_PATH = path.join(directory, 'templates.db');
process.env.JWT_SECRET = 'topic-template-mutation-test-secret';

const [{ initDatabase, closeDatabase }, database, { signToken }, { default: templatesRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/routes/templates.js'),
]);

await initDatabase();
const adminId = await database.executeInsert(
  "INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES('topic-template-recovery-admin','unused','topic-template-recovery-admin@example.invalid','admin','Template Admin',1,0)",
);
const secondAdminId = await database.executeInsert(
  "INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES('topic-template-recovery-admin-2','unused','topic-template-recovery-admin-2@example.invalid','admin','Template Admin Two',1,0)",
);
const memberId = await database.executeInsert(
  "INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES('topic-template-recovery-member','unused','topic-template-recovery-member@example.invalid','member','Template Member',1,0)",
);
await database.execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [adminId, 'admin']);
await database.execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [secondAdminId, 'admin']);
await database.execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [memberId, 'member']);

const dropResponseHeader = 'x-test-commit-then-drop-response';
const app = express();
app.use(express.json({ limit: '200kb' }));
app.use('/api/templates', (req, res, next) => {
  if (req.header(dropResponseHeader) !== '1' || !['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
  res.json = (() => {
    res.socket?.destroy();
    return res;
  }) as typeof res.json;
  next();
});
app.use('/api/templates', templatesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}/api/templates`;
const headers = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' });
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

type TemplateRow = {
  id: number;
  name: string;
  platform: string | null;
  description: string | null;
  template_data: string | null;
  creator_id: number | null;
  is_default: number | boolean;
  created_at: string;
  updated_at: string;
  base_fingerprint: string;
};

async function list(userId = adminId): Promise<TemplateRow[]> {
  const response = await fetch(baseUrl, { headers: headers(userId) });
  assert.equal(response.status, 200);
  return (await response.json() as { data: TemplateRow[] }).data;
}

function createFingerprint(payload: { name: string; platform: string; description: string; template_data: string | null; is_default: boolean }) {
  return hash(['create', payload]);
}

function updateFingerprint(id: number, baseFingerprint: string, payload: Record<string, unknown>) {
  return hash(['update', id, baseFingerprint, payload]);
}

function deleteFingerprint(id: number, baseFingerprint: string) {
  return hash(['delete', id, baseFingerprint]);
}

function statusUrl(requestId: string, operation: 'create' | 'update' | 'delete', requestFingerprint: string, targetId?: number) {
  const query = new URLSearchParams({ operation, request_fingerprint: requestFingerprint });
  if (targetId !== undefined) query.set('target_id', String(targetId));
  return `${baseUrl}/requests/${encodeURIComponent(requestId)}?${query.toString()}`;
}

async function requestStatus(
  requestId: string,
  operation: 'create' | 'update' | 'delete',
  requestFingerprint: string,
  targetId?: number,
  userId = adminId,
) {
  return fetch(statusUrl(requestId, operation, requestFingerprint, targetId), { headers: headers(userId) });
}

async function createLegacy(name: string) {
  const response = await fetch(baseUrl, {
    method: 'POST', headers: headers(adminId),
    body: JSON.stringify({ name, platform: '', description: '', template_data: '原始结构' }),
  });
  assert.equal(response.status, 200);
  return (await response.json() as { id: number }).id;
}

try {
  const denied = await fetch(baseUrl, {
    method: 'POST', headers: headers(memberId), body: JSON.stringify({ name: '无权限', template_data: '正文' }),
  });
  assert.equal(denied.status, 403, 'writes retain system:template permission');
  const memberList = await fetch(baseUrl, { headers: headers(memberId) });
  assert.equal(memberList.status, 200, 'the existing authenticated list permission remains unchanged');

  const createId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a67';
  const createPayload = { name: '响应丢失创建模板', platform: '抖音', description: '隔离验收', template_data: '{"opening":"开头"}', is_default: false };
  const createBody = {
    ...createPayload,
    client_request_id: createId,
    request_fingerprint: createFingerprint(createPayload),
  };
  await assert.rejects(fetch(baseUrl, {
    method: 'POST', headers: { ...headers(adminId), [dropResponseHeader]: '1' }, body: JSON.stringify(createBody),
  }), /fetch failed|terminated|socket|network/i, 'the fixture drops the response only after the route commits');
  const createdStatus = await requestStatus(createId, 'create', createBody.request_fingerprint);
  assert.equal(createdStatus.status, 200);
  assert.equal(createdStatus.headers.get('cache-control'), 'no-store');
  const createdStatusBody = await createdStatus.json() as { data: { state: string; target_id: number }; [key: string]: unknown };
  assert.equal(createdStatusBody.data.state, 'processed');
  assert.equal(typeof createdStatusBody.data.target_id, 'number', 'create recovery returns its created target id');
  assert.equal(JSON.stringify(createdStatusBody).includes('开头'), false, 'status returns no template body');
  const createdId = createdStatusBody.data.target_id;
  assert.equal((await list()).filter((template) => template.id === createdId).length, 1, 'the write committed once despite losing its response');

  const createReplay = await fetch(baseUrl, { method: 'POST', headers: headers(adminId), body: JSON.stringify(createBody) });
  assert.equal(createReplay.status, 200);
  assert.deepEqual(await createReplay.json(), { message: '模板创建成功', id: createdId, idempotent_replay: true });
  assert.equal((await list()).filter((template) => template.id === createdId).length, 1, 'same-key create replay is idempotent');
  const createMismatchBody = { ...createBody, description: '改过的载荷' };
  createMismatchBody.request_fingerprint = createFingerprint({ ...createPayload, description: '改过的载荷' });
  const createConflict = await fetch(baseUrl, { method: 'POST', headers: headers(adminId), body: JSON.stringify(createMismatchBody) });
  assert.equal(createConflict.status, 409);
  assert.equal((await createConflict.json() as { code: string }).code, 'TOPIC_TEMPLATE_MUTATION_REQUEST_CONFLICT');

  const otherActorStatus = await requestStatus(createId, 'create', createBody.request_fingerprint, undefined, secondAdminId);
  assert.deepEqual(await otherActorStatus.json(), { data: { state: 'not_found' } }, 'other actors cannot inspect a receipt');
  const memberStatus = await requestStatus(createId, 'create', createBody.request_fingerprint, undefined, memberId);
  assert.equal(memberStatus.status, 403);
  assert.equal(memberStatus.headers.get('cache-control'), 'no-store');
  const unauthenticatedStatus = await fetch(statusUrl(createId, 'create', createBody.request_fingerprint));
  assert.equal(unauthenticatedStatus.status, 401);
  assert.equal(unauthenticatedStatus.headers.get('cache-control'), 'no-store');
  const wrongOperation = await requestStatus(createId, 'update', createBody.request_fingerprint, createdId);
  assert.deepEqual(await wrongOperation.json(), { data: { state: 'conflict' } });

  const updateRow = (await list()).find((template) => template.id === createdId);
  assert(updateRow);
  const updateId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a68';
  const updatePayload = { name: '响应丢失更新模板', template_data: '{"opening":"新开头"}' };
  const updateBody = {
    ...updatePayload,
    client_request_id: updateId,
    base_fingerprint: updateRow.base_fingerprint,
    request_fingerprint: updateFingerprint(createdId, updateRow.base_fingerprint, updatePayload),
  };
  await assert.rejects(fetch(`${baseUrl}/${createdId}`, {
    method: 'PUT', headers: { ...headers(adminId), [dropResponseHeader]: '1' }, body: JSON.stringify(updateBody),
  }), /fetch failed|terminated|socket|network/i);
  const updateStatus = await requestStatus(updateId, 'update', updateBody.request_fingerprint, createdId);
  assert.deepEqual(await updateStatus.json(), { data: { state: 'processed' } });
  const updateReplay = await fetch(`${baseUrl}/${createdId}`, { method: 'PUT', headers: headers(adminId), body: JSON.stringify(updateBody) });
  assert.deepEqual(await updateReplay.json(), { message: '模板更新成功', idempotent_replay: true });
  assert.equal((await list()).find((template) => template.id === createdId)?.name, '响应丢失更新模板');

  const staleRow = (await list()).find((template) => template.id === createdId);
  assert(staleRow);
  const staleBase = staleRow.base_fingerprint;
  const legacyUpdate = await fetch(`${baseUrl}/${createdId}`, {
    method: 'PUT', headers: headers(adminId), body: JSON.stringify({ name: 'legacy concurrent update' }),
  });
  assert.equal(legacyUpdate.status, 200, 'unkeyed legacy PUT behavior remains supported');
  const staleId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a69';
  const stalePayload = { name: 'must not replace newer value' };
  const staleBody = {
    ...stalePayload,
    client_request_id: staleId,
    base_fingerprint: staleBase,
    request_fingerprint: updateFingerprint(createdId, staleBase, stalePayload),
  };
  const staleUpdate = await fetch(`${baseUrl}/${createdId}`, { method: 'PUT', headers: headers(adminId), body: JSON.stringify(staleBody) });
  assert.equal(staleUpdate.status, 409);
  assert.equal((await staleUpdate.json() as { code: string }).code, 'TOPIC_TEMPLATE_UPDATE_BASE_CONFLICT');
  assert.equal((await requestStatus(staleId, 'update', staleBody.request_fingerprint, createdId).then((response) => response.json()) as { data: { state: string } }).data.state, 'not_found');
  assert.equal((await list()).find((template) => template.id === createdId)?.name, 'legacy concurrent update');

  const rollbackRow = (await list()).find((template) => template.id === createdId);
  assert(rollbackRow);
  const rollbackId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a70';
  const rollbackPayload = { name: 'rollback candidate' };
  const rollbackBody = {
    ...rollbackPayload,
    client_request_id: rollbackId,
    base_fingerprint: rollbackRow.base_fingerprint,
    request_fingerprint: updateFingerprint(createdId, rollbackRow.base_fingerprint, rollbackPayload),
  };
  await database.execute(`CREATE TRIGGER topic_template_receipt_failure
    BEFORE INSERT ON topic_template_mutation_request_keys
    BEGIN SELECT RAISE(ABORT, 'injected topic template receipt failure'); END`);
  const rolledBack = await fetch(`${baseUrl}/${createdId}`, { method: 'PUT', headers: headers(adminId), body: JSON.stringify(rollbackBody) });
  assert.equal(rolledBack.status, 500);
  await database.execute('DROP TRIGGER topic_template_receipt_failure');
  assert.equal((await list()).find((template) => template.id === createdId)?.name, 'legacy concurrent update', 'receipt failure rolls back the template update');
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM topic_template_mutation_request_keys WHERE client_request_id=?', [rollbackId],
  ).then((row) => row?.count)), 0);

  const concurrentTemplateId = await createLegacy('CAS concurrency baseline');
  const concurrentRow = (await list()).find((template) => template.id === concurrentTemplateId);
  assert(concurrentRow);
  const concurrentBase = concurrentRow.base_fingerprint;
  const firstId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a71';
  const secondId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a72';
  const firstPayload = { name: 'CAS winner one' };
  const secondPayload = { name: 'CAS winner two' };
  const concurrentBodies = [
    { ...firstPayload, client_request_id: firstId, base_fingerprint: concurrentBase, request_fingerprint: updateFingerprint(concurrentTemplateId, concurrentBase, firstPayload) },
    { ...secondPayload, client_request_id: secondId, base_fingerprint: concurrentBase, request_fingerprint: updateFingerprint(concurrentTemplateId, concurrentBase, secondPayload) },
  ];
  const concurrentResponses = await Promise.all(concurrentBodies.map((body) => fetch(`${baseUrl}/${concurrentTemplateId}`, {
    method: 'PUT', headers: headers(adminId), body: JSON.stringify(body),
  })));
  assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [200, 409], 'only one concurrent update wins the same baseline');

  const deleteTemplateId = await createLegacy('响应丢失删除模板');
  const deleteRow = (await list()).find((template) => template.id === deleteTemplateId);
  assert(deleteRow);
  const deleteId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a73';
  const deleteBody = {
    client_request_id: deleteId,
    base_fingerprint: deleteRow.base_fingerprint,
    request_fingerprint: deleteFingerprint(deleteTemplateId, deleteRow.base_fingerprint),
  };
  await assert.rejects(fetch(`${baseUrl}/${deleteTemplateId}`, {
    method: 'DELETE', headers: { ...headers(adminId), [dropResponseHeader]: '1' }, body: JSON.stringify(deleteBody),
  }), /fetch failed|terminated|socket|network/i);
  assert.equal((await database.queryOne('SELECT id FROM topic_templates WHERE id=?', [deleteTemplateId])), null);
  const deleteStatus = await requestStatus(deleteId, 'delete', deleteBody.request_fingerprint, deleteTemplateId);
  assert.deepEqual(await deleteStatus.json(), { data: { state: 'processed' } }, 'delete tombstone confirms the committed delete');
  const deleteReplay = await fetch(`${baseUrl}/${deleteTemplateId}`, { method: 'DELETE', headers: headers(adminId), body: JSON.stringify(deleteBody) });
  assert.deepEqual(await deleteReplay.json(), { message: '模板删除成功', idempotent_replay: true });
  assert.equal(Number(await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM topic_template_mutation_request_keys WHERE client_request_id=?', [deleteId],
  ).then((row) => row?.count)), 1, 'the deletion tombstone survives target removal');

  const absentId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a74';
  const notFound = await requestStatus(absentId, 'create', 'f'.repeat(64));
  assert.deepEqual(await notFound.json(), { data: { state: 'not_found' } });
  const missingTarget = await requestStatus(absentId, 'delete', 'f'.repeat(64), 999999);
  assert.deepEqual(await missingTarget.json(), { data: { state: 'target_missing' } });

  console.log('Topic-template mutation recovery HTTP test passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
