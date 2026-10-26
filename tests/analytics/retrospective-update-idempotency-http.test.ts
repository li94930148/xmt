import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retrospective-update-idempotency-'));
process.env.XMT_DB_PATH = path.join(directory, 'retrospective-update-idempotency.db');
process.env.JWT_SECRET = 'retrospective-update-idempotency-test-secret';

const [{ initDatabase, closeDatabase }, database, { signToken }, { default: retrospectivesRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/routes/retrospectives.js'),
]);

await initDatabase();
const actorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_update_actor','unused','admin','复盘更新管理员',1)",
);
const secondActorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_update_actor2','unused','admin','复盘更新管理员二',1)",
);
const readerId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_update_reader','unused','analyst','复盘更新只读成员',1)",
);
const retroId = await database.executeInsert(
  `INSERT INTO retrospectives(title,scope_type,period_start,period_end,status,owner_id,created_by,summary_md,version)
   VALUES('复盘结论幂等测试','team','2026-10-01','2026-10-07','draft',?,?, '初始结论',1)`,
  [actorId, actorId],
);
const secondRetroId = await database.executeInsert(
  `INSERT INTO retrospectives(title,scope_type,period_start,period_end,status,owner_id,created_by,summary_md,version)
   VALUES('复盘请求范围测试','team','2026-10-08','2026-10-14','draft',?,?, '第二份初始结论',1)`,
  [actorId, actorId],
);
const partialRetroId = await database.executeInsert(
  `INSERT INTO retrospectives(title,scope_type,period_start,period_end,status,owner_id,created_by,summary_md,version)
   VALUES('部分字段回放测试','team','2026-10-15','2026-10-21','draft',?,?, '初始内容',1)`,
  [actorId, actorId],
);

const app = express();
app.use(express.json());
app.use('/api/retrospectives', retrospectivesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api/retrospectives`;
const headersFor = (userId: number) => ({
  Authorization: `Bearer ${signToken({ userId })}`,
  'Content-Type': 'application/json',
});
const actorHeaders = headersFor(actorId);
const secondActorHeaders = headersFor(secondActorId);
const readerHeaders = headersFor(readerId);
const primaryKey = 'ca1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
const update = (id: number, requestKey: string | undefined, headers: Record<string, string>, body: Record<string, unknown>) => fetch(
  `${baseUrl}/${id}`,
  {
    method: 'PUT',
    headers: requestKey ? { ...headers, 'X-Idempotency-Key': requestKey } : headers,
    body: JSON.stringify(body),
  },
);
const requestStatus = (id: number, requestKey: string, headers = actorHeaders) => fetch(
  `${baseUrl}/${id}/update-requests/${requestKey}`,
  { headers },
);
const versionAndSummary = (id: number) => database.queryOne<{ title: string; summary_md: string; version: number }>(
  'SELECT title,summary_md,version FROM retrospectives WHERE id=?', [id],
);
const auditCount = (id: number) => database.queryOne<{ count: number }>(
  "SELECT COUNT(*) AS count FROM retro_audit_logs WHERE retro_id=? AND action='update'", [id],
);
const receiptCount = (id: number, requestKey: string, userId = actorId) => database.queryOne<{ count: number }>(
  'SELECT COUNT(*) AS count FROM retrospective_update_request_keys WHERE actor_id=? AND retrospective_id=? AND client_request_id=?',
  [userId, id, requestKey],
);

try {
  const payload = { title: '复盘结论幂等测试', summaryMd: '同一个请求只保存一次', version: 1 };
  const concurrent = await Promise.all([
    update(retroId, primaryKey, actorHeaders, payload),
    update(retroId, primaryKey, actorHeaders, payload),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status), [200, 200], 'same-key concurrent updates return success');
  assert.deepEqual(await versionAndSummary(retroId), { title: payload.title, summary_md: payload.summaryMd, version: 2 });
  assert.equal(Number((await auditCount(retroId))?.count), 1, 'concurrent replay writes one update audit');
  assert.equal(Number((await receiptCount(retroId, primaryKey))?.count), 1, 'concurrent replay stores one receipt');

  const replay = await update(retroId, primaryKey, actorHeaders, payload);
  assert.equal(replay.status, 200, 'same actor, key, payload is replay-safe');
  const changedPayload = await update(retroId, primaryKey, actorHeaders, { ...payload, summaryMd: '不可替换原结果' });
  assert.equal(changedPayload.status, 409);
  assert.equal((await changedPayload.json() as { code: string }).code, 'RETROSPECTIVE_UPDATE_REQUEST_CONFLICT');
  const status = await requestStatus(retroId, primaryKey);
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await status.json() as { data: unknown }).data, { state: 'processed' });
  assert.deepEqual((await (await requestStatus(retroId, primaryKey, readerHeaders)).json() as { data: unknown }).data, { state: 'not_found' }, 'another actor cannot inspect the receipt');
  assert.deepEqual((await (await requestStatus(secondRetroId, primaryKey)).json() as { data: unknown }).data, { state: 'not_found' }, 'receipts are scoped to a retrospective');
  assert.equal((await requestStatus(retroId, primaryKey)).headers.get('cache-control'), 'no-store');
  assert.equal((await requestStatus(retroId, primaryKey, {} as Record<string, string>)).status, 401, 'status query requires authentication');

  const missingVersionKey = 'ba1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const missingVersion = await update(partialRetroId, missingVersionKey, actorHeaders, { summaryMd: '缺少版本号' });
  assert.equal(missingVersion.status, 400, 'keyed updates require a stable version for replay fingerprinting');
  assert.equal((await missingVersion.json() as { code: string }).code, 'VERSION_REQUIRED');
  const partialKey = 'bb1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const partialPayload = { summaryMd: '只提交结论字段', version: 1 };
  assert.equal((await update(partialRetroId, partialKey, actorHeaders, partialPayload)).status, 200);
  assert.equal((await update(partialRetroId, undefined, actorHeaders, {
    title: '后续更新的标题', summaryMd: '后续更新的结论', version: 2,
  })).status, 200);
  const partialReplay = await update(partialRetroId, partialKey, actorHeaders, partialPayload);
  assert.equal(partialReplay.status, 200, 'same-key partial request remains recognizable after later fields change');
  assert.deepEqual(await versionAndSummary(partialRetroId), {
    title: '后续更新的标题', summary_md: '后续更新的结论', version: 3,
  }, 'replaying an older partial request never overwrites later edits');
  assert.equal(Number((await auditCount(partialRetroId))?.count), 2, 'partial-request replay does not duplicate its original audit');

  const actorScopedKey = 'da1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const actorScoped = await update(retroId, actorScopedKey, secondActorHeaders, {
    title: '复盘结论幂等测试', summaryMd: '另一个操作者可以独立使用该编号', version: 2,
  });
  assert.equal(actorScoped.status, 200, 'the same UUID has an independent actor scope');
  assert.deepEqual((await (await requestStatus(retroId, actorScopedKey, secondActorHeaders)).json() as { data: unknown }).data, { state: 'processed' });
  assert.deepEqual((await (await requestStatus(retroId, actorScopedKey, actorHeaders)).json() as { data: unknown }).data, { state: 'not_found' });

  const conflictKey = 'ea1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const conflict = await update(retroId, conflictKey, actorHeaders, {
    title: '旧页面标题', summaryMd: '旧页面结论', version: 2,
  });
  assert.equal(conflict.status, 409, 'a stale version is recorded as a durable conflict');
  assert.equal((await conflict.json() as { code: string }).code, 'VERSION_CONFLICT');
  assert.deepEqual((await (await requestStatus(retroId, conflictKey)).json() as { data: unknown }).data, { state: 'conflict' });
  assert.equal(Number((await auditCount(retroId))?.count), 2, 'a conflict does not add an update audit');
  assert.deepEqual(await versionAndSummary(retroId), {
    title: payload.title,
    summary_md: '另一个操作者可以独立使用该编号',
    version: 3,
  }, 'a stale summary update does not overwrite the current version');
  const sameConflictReplay = await update(retroId, conflictKey, actorHeaders, {
    title: '旧页面标题', summaryMd: '旧页面结论', version: 2,
  });
  assert.equal(sameConflictReplay.status, 409, 'same-key replay preserves conflict outcome');
  const conflictingRetry = await update(retroId, conflictKey, actorHeaders, {
    title: '另一个旧标题', summaryMd: '另一个旧结论', version: 2,
  });
  assert.equal(conflictingRetry.status, 409, 'a request key cannot be reused for different content');
  assert.equal((await conflictingRetry.json() as { code: string }).code, 'RETROSPECTIVE_UPDATE_REQUEST_CONFLICT');

  const legacyVersion = 1;
  const legacy = await update(secondRetroId, undefined, actorHeaders, {
    title: '复盘请求范围测试', summaryMd: '旧客户端仍支持', version: legacyVersion,
  });
  assert.equal(legacy.status, 200, 'legacy unkeyed clients remain supported');
  const staleLegacy = await update(secondRetroId, undefined, actorHeaders, {
    title: '复盘请求范围测试', summaryMd: '不得覆盖', version: legacyVersion,
  });
  assert.equal(staleLegacy.status, 409, 'legacy stale versions still receive a conflict');

  const auditFailureKey = 'fa1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await database.execute(`
    CREATE TRIGGER reject_retro_update_audit
    BEFORE INSERT ON retro_audit_logs
    WHEN NEW.action = 'update'
    BEGIN SELECT RAISE(ABORT, 'simulated retrospective update audit failure'); END
  `);
  const auditFailure = await update(secondRetroId, auditFailureKey, actorHeaders, {
    title: '复盘请求范围测试', summaryMd: '事务必须回滚', version: 2,
  });
  assert.equal(auditFailure.status, 500);
  assert.deepEqual(await versionAndSummary(secondRetroId), {
    title: '复盘请求范围测试', summary_md: '旧客户端仍支持', version: 2,
  }, 'audit failure rolls back the update and version');
  assert.equal(Number((await receiptCount(secondRetroId, auditFailureKey))?.count), 0, 'audit failure leaves no processed receipt');
  await database.execute('DROP TRIGGER reject_retro_update_audit');
  const afterAuditRecovery = await update(secondRetroId, auditFailureKey, actorHeaders, {
    title: '复盘请求范围测试', summaryMd: '事务必须回滚', version: 2,
  });
  assert.equal(afterAuditRecovery.status, 200, 'the original key can be explicitly retried after transaction rollback');
  assert.equal(Number((await auditCount(secondRetroId))?.count), 2, 'successful retry records a single update audit');

  console.log('Retrospective update idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
