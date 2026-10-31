import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retro-create-idempotency-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'retro-create-idempotency.test.db');
process.env.JWT_SECRET = 'retro-create-idempotency-test-secret';

const [{ initDatabase, closeDatabase }, database, { signToken }, { default: retrospectivesRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/routes/retrospectives.js'),
]);

await initDatabase();
const actorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_idempotency_admin','unused','admin','复盘幂等管理员',1)",
);
const secondActorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_idempotency_admin2','unused','admin','复盘幂等管理员二',1)",
);
const readOnlyActorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_idempotency_reader','unused','analyst','无创建权限成员',1)",
);

const app = express();
app.use(express.json());
app.use('/api/retrospectives', retrospectivesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api/retrospectives`;
const actorHeaders = { Authorization: `Bearer ${signToken({ userId: actorId })}`, 'Content-Type': 'application/json' };
const secondActorHeaders = { Authorization: `Bearer ${signToken({ userId: secondActorId })}`, 'Content-Type': 'application/json' };
const readOnlyHeaders = { Authorization: `Bearer ${signToken({ userId: readOnlyActorId })}`, 'Content-Type': 'application/json' };
const requestId = 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
const createPayload = {
  title: '服务端幂等复盘测试',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-07',
  scopeType: 'team',
};

try {
  const firstResponse = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...actorHeaders, 'X-Idempotency-Key': requestId },
    body: JSON.stringify(createPayload),
  });
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json() as { data: { retrospective: { id: number } } };
  const retrospectiveId = Number(first.data.retrospective.id);

  const replayResponse = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...actorHeaders, 'X-Idempotency-Key': requestId },
    body: JSON.stringify(createPayload),
  });
  assert.equal(replayResponse.status, 200, 'same actor and normalized payload replay successfully');
  const replay = await replayResponse.json() as { data: { retrospective: { id: number } } };
  assert.equal(Number(replay.data.retrospective.id), retrospectiveId, 'replay returns the original retrospective ID');
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retrospectives'))?.count), 1);
  assert.equal(Number((await database.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM retro_audit_logs WHERE retro_id=? AND action='create'",
    [retrospectiveId],
  ))?.count), 1, 'replay does not duplicate the create audit');

  const changedPayloadResponse = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...actorHeaders, 'X-Idempotency-Key': requestId },
    body: JSON.stringify({ ...createPayload, title: '不同载荷' }),
  });
  assert.equal(changedPayloadResponse.status, 409, 'same request key with a different fingerprint conflicts');

  const secondActorResponse = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...secondActorHeaders, 'X-Idempotency-Key': requestId },
    body: JSON.stringify(createPayload),
  });
  assert.equal(secondActorResponse.status, 409, 'request keys cannot be replayed across actors');

  const stateResponse = await fetch(`${baseUrl}/create-requests/${requestId}`, { headers: actorHeaders });
  assert.equal(stateResponse.status, 200);
  assert.equal(stateResponse.headers.get('Cache-Control'), 'no-store', 'created status must not be cached');
  assert.deepEqual((await stateResponse.json() as { data: unknown }).data, {
    state: 'created', retrospectiveId,
  });
  const isolatedStateResponse = await fetch(`${baseUrl}/create-requests/${requestId}`, { headers: readOnlyHeaders });
  assert.equal(isolatedStateResponse.status, 200, 'status lookup does not require retrospective create permission');
  assert.equal(isolatedStateResponse.headers.get('Cache-Control'), 'no-store', 'actor-scoped not-found status must not be cached');
  assert.deepEqual((await isolatedStateResponse.json() as { data: unknown }).data, { state: 'not_found' }, 'another actor cannot observe the original actor result');
  const unknownStateResponse = await fetch(`${baseUrl}/create-requests/00112233-4455-4677-8899-aabbccddeeff`, { headers: readOnlyHeaders });
  assert.equal(unknownStateResponse.status, 200);
  assert.equal(unknownStateResponse.headers.get('Cache-Control'), 'no-store', 'missing status must not be cached');
  assert.deepEqual((await unknownStateResponse.json() as { data: unknown }).data, { state: 'not_found' });
  const invalidStateResponse = await fetch(`${baseUrl}/create-requests/not-a-uuid`, { headers: actorHeaders });
  assert.equal(invalidStateResponse.status, 400);
  assert.equal(invalidStateResponse.headers.get('Cache-Control'), 'no-store', 'invalid status must not be cached');
  const unauthenticatedStateResponse = await fetch(`${baseUrl}/create-requests/${requestId}`);
  assert.equal(unauthenticatedStateResponse.status, 401);
  assert.equal(unauthenticatedStateResponse.headers.get('Cache-Control'), 'no-store', 'authentication failure must not be cached');

  const noPermissionCreate = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...readOnlyHeaders, 'X-Idempotency-Key': '00112233-4455-4677-8899-aabbccddeeff' },
    body: JSON.stringify(createPayload),
  });
  assert.equal(noPermissionCreate.status, 403, 'new create still requires create permission');

  const temporaryRoleId = await database.executeInsert(
    "INSERT INTO roles(code,name,is_system) VALUES('retro_idempotency_temporary','复盘幂等临时授权',0)",
  );
  await database.execute(
    'INSERT INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE code=?',
    [temporaryRoleId, 'analytics:retro:create'],
  );
  await database.execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [readOnlyActorId, temporaryRoleId]);
  const readOnlyRequestId = '33445566-7788-499a-abcc-ddeeff001122';
  const readOnlyCreate = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...readOnlyHeaders, 'X-Idempotency-Key': readOnlyRequestId },
    body: JSON.stringify({ ...createPayload, title: '授权成员复盘' }),
  });
  assert.equal(readOnlyCreate.status, 200);
  const readOnlyCreated = await readOnlyCreate.json() as { data: { retrospective: { id: number } } };
  await database.execute('DELETE FROM user_roles WHERE user_id=? AND role_id=?', [readOnlyActorId, temporaryRoleId]);
  await database.execute('DELETE FROM role_permissions WHERE role_id=?', [temporaryRoleId]);
  const revokedPermissionState = await fetch(`${baseUrl}/create-requests/${readOnlyRequestId}`, { headers: readOnlyHeaders });
  assert.equal(revokedPermissionState.status, 200, 'actor can read back a prior result after create permission is revoked');
  assert.equal(revokedPermissionState.headers.get('Cache-Control'), 'no-store', 'recovered status remains uncached after permission changes');
  assert.deepEqual((await revokedPermissionState.json() as { data: unknown }).data, {
    state: 'created', retrospectiveId: Number(readOnlyCreated.data.retrospective.id),
  });
  const revokedPermissionReplay = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...readOnlyHeaders, 'X-Idempotency-Key': readOnlyRequestId },
    body: JSON.stringify({ ...createPayload, title: '授权成员复盘' }),
  });
  assert.equal(revokedPermissionReplay.status, 200, 'same-actor replay recovers the result without current create permission');
  assert.equal(Number((await revokedPermissionReplay.json() as { data: { retrospective: { id: number } } }).data.retrospective.id), Number(readOnlyCreated.data.retrospective.id));

  const concurrentRequestId = '22334455-6677-4889-9abb-ccddeeff0011';
  const concurrentCreates = await Promise.all([1, 2].map(() => fetch(baseUrl, {
    method: 'POST',
    headers: { ...actorHeaders, 'X-Idempotency-Key': concurrentRequestId },
    body: JSON.stringify({ ...createPayload, title: '并发重试复盘' }),
  })));
  assert.deepEqual(concurrentCreates.map((response) => response.status), [200, 200], 'concurrent retries both resolve successfully');
  const concurrentBodies = await Promise.all(concurrentCreates.map((response) => response.json() as Promise<{ data: { retrospective: { id: number } } }>));
  assert.equal(Number(concurrentBodies[0].data.retrospective.id), Number(concurrentBodies[1].data.retrospective.id), 'concurrent retries converge on one retrospective ID');
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retrospective_create_request_keys'))?.count), 3);

  const legacyResponse = await fetch(baseUrl, {
    method: 'POST',
    headers: actorHeaders,
    body: JSON.stringify({ ...createPayload, title: '旧客户端无请求键复盘' }),
  });
  assert.equal(legacyResponse.status, 200, 'legacy clients without a request key remain supported');
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retrospectives'))?.count), 4);
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retrospective_create_request_keys'))?.count), 3, 'legacy create does not require a request ledger row');

  await database.execute(`
    CREATE TRIGGER reject_retro_create_audit
    BEFORE INSERT ON retro_audit_logs
    WHEN NEW.action = 'create'
    BEGIN SELECT RAISE(ABORT, 'simulated retrospective audit failure'); END
  `);
  const failedAtomicAudit = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...actorHeaders, 'X-Idempotency-Key': '44556677-8899-4aab-bcdd-eeff00112233' },
    body: JSON.stringify({ ...createPayload, title: '审计失败应回滚的复盘' }),
  });
  assert.equal(failedAtomicAudit.status, 500);
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retrospectives'))?.count), 4, 'audit failure rolls back the retrospective row');
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retrospective_create_request_keys'))?.count), 3, 'audit failure leaves no request ledger row');
  await database.execute('DROP TRIGGER reject_retro_create_audit');

  await database.execute(`
    CREATE TRIGGER reject_retro_create_request_key
    BEFORE INSERT ON retrospective_create_request_keys
    BEGIN SELECT RAISE(ABORT, 'simulated request ledger failure'); END
  `);
  const failedAtomicCreate = await fetch(baseUrl, {
    method: 'POST',
    headers: { ...actorHeaders, 'X-Idempotency-Key': '11223344-5566-4788-99aa-bbccddeeff00' },
    body: JSON.stringify({ ...createPayload, title: '必须整体回滚的复盘' }),
  });
  assert.equal(failedAtomicCreate.status, 500);
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retrospectives'))?.count), 4, 'ledger failure rolls back the retrospective row');
  assert.equal(Number((await database.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM retro_audit_logs WHERE action='create'",
  ))?.count), 4, 'ledger failure rolls back the audit row');
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retrospective_create_request_keys'))?.count), 3);
  await database.execute('DROP TRIGGER reject_retro_create_request_key');

  assert.equal((await database.queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  console.log('Retrospective create idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
