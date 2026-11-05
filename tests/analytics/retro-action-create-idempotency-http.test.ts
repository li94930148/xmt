import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retro-action-create-idempotency-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'retro-action-create-idempotency.test.db');
process.env.JWT_SECRET = 'retro-action-create-idempotency-test-secret';

const [{ initDatabase, closeDatabase }, database, { signToken }, { default: retrospectivesRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/routes/retrospectives.js'),
]);

await initDatabase();
const actorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_action_idempotency_admin','unused','admin','行动项幂等管理员',1)",
);
const secondActorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_action_idempotency_admin2','unused','admin','行动项幂等管理员二',1)",
);
const readOnlyActorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_action_idempotency_reader','unused','analyst','无行动项权限成员',1)",
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
const createRetro = async (title: string, headers = actorHeaders) => {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-07',
      scopeType: 'team',
    }),
  });
  assert.equal(response.status, 200);
  return Number((await response.json() as { data: { retrospective: { id: number } } }).data.retrospective.id);
};
const actionCount = (retroId: number) => database.queryOne<{ count: number }>(
  'SELECT COUNT(*) AS count FROM retro_actions WHERE retro_id=?', [retroId],
);
const auditCount = (retroId: number) => database.queryOne<{ count: number }>(
  "SELECT COUNT(*) AS count FROM retro_audit_logs WHERE retro_id=? AND action='action_create'", [retroId],
);

try {
  const retroId = await createRetro('行动项创建幂等复盘');
  const otherRetroId = await createRetro('请求编号隔离复盘');
  const requestId = 'c01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const payload = { title: '  完成风险应对计划  ', descriptionMd: '根据日报风险分段补充计划', ownerId: secondActorId, dueDate: '2026-10-09' };

  // Ignore the response body to model a committed request whose client lost its result.
  const firstResponse = await fetch(`${baseUrl}/${retroId}/actions`, {
    method: 'POST',
    headers: { ...actorHeaders, 'X-Idempotency-Key': requestId },
    body: JSON.stringify(payload),
  });
  assert.equal(firstResponse.status, 200);
  await firstResponse.text();

  const statusUrl = `${baseUrl}/${retroId}/actions/create-requests/${requestId}`;
  const stateResponse = await fetch(statusUrl, { headers: actorHeaders });
  assert.equal(stateResponse.status, 200);
  assert.equal(stateResponse.headers.get('cache-control'), 'no-store');
  const status = (await stateResponse.json() as { data: { state: string; actionId?: number } }).data;
  assert.equal(status.state, 'created', 'read-only status recovers the committed action');
  const actionId = Number(status.actionId);

  const replayResponse = await fetch(`${baseUrl}/${retroId}/actions`, {
    method: 'POST',
    headers: { ...actorHeaders, 'X-Idempotency-Key': requestId },
    body: JSON.stringify({ ...payload, title: payload.title.trim() }),
  });
  assert.equal(replayResponse.status, 200, 'normalized same request replays successfully');
  const replay = (await replayResponse.json() as { data: { actions: Array<{ id: number }> } }).data;
  assert.equal(replay.actions.filter((action) => action.id === actionId).length, 1);
  assert.equal(Number((await actionCount(retroId))?.count), 1, 'replay does not duplicate the action');
  assert.equal(Number((await auditCount(retroId))?.count), 1, 'replay does not duplicate the audit');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(Number((await database.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND title='你有新的复盘行动项'", [secondActorId],
  ))?.count), 1, 'replay does not duplicate the assignment notification');

  const changedPayload = await fetch(`${baseUrl}/${retroId}/actions`, {
    method: 'POST', headers: { ...actorHeaders, 'X-Idempotency-Key': requestId },
    body: JSON.stringify({ ...payload, title: '替换为其他行动项' }),
  });
  assert.equal(changedPayload.status, 409, 'same request key cannot authorize a changed payload');
  const otherActorReuse = await fetch(`${baseUrl}/${retroId}/actions`, {
    method: 'POST', headers: { ...secondActorHeaders, 'X-Idempotency-Key': requestId }, body: JSON.stringify(payload),
  });
  assert.equal(otherActorReuse.status, 409, 'same request key cannot replay across actors');
  const otherRetroReuse = await fetch(`${baseUrl}/${otherRetroId}/actions`, {
    method: 'POST', headers: { ...actorHeaders, 'X-Idempotency-Key': requestId }, body: JSON.stringify(payload),
  });
  assert.equal(otherRetroReuse.status, 409, 'same request key cannot replay across retrospectives');

  const otherActorStatus = await fetch(statusUrl, { headers: secondActorHeaders });
  assert.equal(otherActorStatus.status, 200);
  assert.equal(otherActorStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await otherActorStatus.json() as { data: unknown }).data, { state: 'not_found' }, 'status does not reveal another actor result');
  const otherRetroStatus = await fetch(`${baseUrl}/${otherRetroId}/actions/create-requests/${requestId}`, { headers: actorHeaders });
  assert.equal(otherRetroStatus.status, 200);
  assert.equal(otherRetroStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await otherRetroStatus.json() as { data: unknown }).data, { state: 'not_found' }, 'status is isolated by retrospective');
  const unknownStatus = await fetch(`${baseUrl}/${retroId}/actions/create-requests/00112233-4455-4677-8899-aabbccddeeff`, { headers: actorHeaders });
  assert.equal(unknownStatus.status, 200);
  assert.equal(unknownStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await unknownStatus.json() as { data: unknown }).data, { state: 'not_found' });
  const unauthorizedStatus = await fetch(statusUrl, { headers: readOnlyHeaders });
  assert.equal(unauthorizedStatus.status, 403, 'read-only status preserves the existing action-manage permission');
  assert.equal(unauthorizedStatus.headers.get('cache-control'), 'no-store');
  const invalidStatus = await fetch(`${baseUrl}/${retroId}/actions/create-requests/not-a-uuid`, { headers: actorHeaders });
  assert.equal(invalidStatus.status, 400);
  assert.equal(invalidStatus.headers.get('cache-control'), 'no-store');
  const unauthenticatedStatus = await fetch(statusUrl);
  assert.equal(unauthenticatedStatus.status, 401);
  assert.equal(unauthenticatedStatus.headers.get('cache-control'), 'no-store');
  const unauthorizedCreate = await fetch(`${baseUrl}/${retroId}/actions`, {
    method: 'POST', headers: { ...readOnlyHeaders, 'X-Idempotency-Key': '00112233-4455-4677-8899-aabbccddeeff' },
    body: JSON.stringify({ title: '无权限行动项' }),
  });
  assert.equal(unauthorizedCreate.status, 403, 'create still requires existing action-manage permission');

  const retryId = 'd01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const retryStatus = await fetch(`${baseUrl}/${retroId}/actions/create-requests/${retryId}`, { headers: actorHeaders });
  assert.equal(retryStatus.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await retryStatus.json() as { data: unknown }).data, { state: 'not_found' }, 'only a confirmed not-found result is retryable');
  const concurrentId = 'e01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const concurrent = await Promise.all([1, 2].map(() => fetch(`${baseUrl}/${retroId}/actions`, {
    method: 'POST', headers: { ...actorHeaders, 'X-Idempotency-Key': concurrentId },
    body: JSON.stringify({ title: '同请求并发行动项' }),
  })));
  assert.deepEqual(concurrent.map((response) => response.status), [200, 200]);
  assert.equal(Number((await actionCount(retroId))?.count), 2, 'concurrent retry converges on one new action');
  assert.equal(Number((await auditCount(retroId))?.count), 2, 'concurrent retry writes one audit');

  await database.execute(`
    CREATE TRIGGER reject_retro_action_create_audit
    BEFORE INSERT ON retro_audit_logs
    WHEN NEW.action = 'action_create'
    BEGIN SELECT RAISE(ABORT, 'simulated action audit failure'); END
  `);
  const failedAuditId = 'f01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const failedAudit = await fetch(`${baseUrl}/${retroId}/actions`, {
    method: 'POST', headers: { ...actorHeaders, 'X-Idempotency-Key': failedAuditId }, body: JSON.stringify({ title: '审计失败需回滚' }),
  });
  assert.equal(failedAudit.status, 500);
  assert.equal(Number((await actionCount(retroId))?.count), 2, 'audit failure rolls back action row');
  assert.equal(Number((await database.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM retro_action_create_request_keys'))?.count), 2, 'audit failure leaves no request key');
  await database.execute('DROP TRIGGER reject_retro_action_create_audit');

  await database.execute(`
    CREATE TRIGGER reject_retro_action_request_key
    BEFORE INSERT ON retro_action_create_request_keys
    BEGIN SELECT RAISE(ABORT, 'simulated action request ledger failure'); END
  `);
  const failedLedger = await fetch(`${baseUrl}/${retroId}/actions`, {
    method: 'POST', headers: { ...actorHeaders, 'X-Idempotency-Key': 'a1122334-5566-4788-99aa-bbccddeeff00' },
    body: JSON.stringify({ title: '台账失败需整体回滚' }),
  });
  assert.equal(failedLedger.status, 500);
  assert.equal(Number((await actionCount(retroId))?.count), 2, 'ledger failure rolls back action row');
  assert.equal(Number((await auditCount(retroId))?.count), 2, 'ledger failure rolls back audit row');
  await database.execute('DROP TRIGGER reject_retro_action_request_key');

  assert.equal((await database.queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  console.log('Retrospective action create idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
