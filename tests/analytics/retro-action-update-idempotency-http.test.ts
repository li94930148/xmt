import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-retro-action-update-idempotency-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'retro-action-update-idempotency.test.db');
process.env.JWT_SECRET = 'retro-action-update-idempotency-test-secret';

const [{ initDatabase, closeDatabase, db }, database, { signToken }, { clearPermissionCache }, { default: retrospectivesRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/middleware/permissions.js'),
  import('../../api/routes/retrospectives.js'),
]);

await initDatabase();
const actorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_action_update_manager','unused','member','复盘行动项更新成员',1)",
);
const secondActorId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_action_update_second_manager','unused','admin','复盘行动项更新管理员',1)",
);
const ownerId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_action_update_owner','unused','member','行动项负责人',1)",
);
const readerId = await database.executeInsert(
  "INSERT INTO users(username,password,role,name,enabled) VALUES('retro_action_update_reader','unused','analyst','只读核实成员',1)",
);
const customRoleId = await database.executeInsert(
  "INSERT INTO roles(code,name,is_system) VALUES('retro_action_update_role','复盘行动项更新测试角色',0)",
);
await database.execute(
  `INSERT INTO role_permissions(role_id,permission_id)
   SELECT ?,id FROM permissions WHERE code IN ('analytics:retro:action_manage','analytics:retro:view')`,
  [customRoleId],
);
await database.execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [actorId, customRoleId]);
clearPermissionCache();

const retroId = await database.executeInsert(
  `INSERT INTO retrospectives(title,scope_type,period_start,period_end,status,owner_id,created_by,version)
   VALUES('行动项更新结果核实复盘','team','2026-10-01','2026-10-07','published',?,?,1)`,
  [ownerId, secondActorId],
);
const actionId = await database.executeInsert(
  `INSERT INTO retro_actions(retro_id,title,description_md,owner_id,due_date,status,result_md,created_by)
   VALUES(?, '需要安全更新的行动项', '初始说明', ?, '2026-10-09', 'todo', '', ?)`,
  [retroId, ownerId, secondActorId],
);
const anotherActionId = await database.executeInsert(
  `INSERT INTO retro_actions(retro_id,title,description_md,owner_id,due_date,status,result_md,created_by)
   VALUES(?, '同键隔离行动项', '', ?, NULL, 'todo', '', ?)`,
  [retroId, ownerId, secondActorId],
);
const auditFailureActionId = await database.executeInsert(
  `INSERT INTO retro_actions(retro_id,title,description_md,owner_id,due_date,status,result_md,created_by)
   VALUES(?, '审计失败行动项', '', ?, NULL, 'todo', '', ?)`,
  [retroId, ownerId, secondActorId],
);
const casFailureActionId = await database.executeInsert(
  `INSERT INTO retro_actions(retro_id,title,description_md,owner_id,due_date,status,result_md,created_by)
   VALUES(?, '状态已变化行动项', '', ?, NULL, 'todo', '', ?)`,
  [retroId, ownerId, secondActorId],
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
const ownerHeaders = { Authorization: `Bearer ${signToken({ userId: ownerId })}`, 'Content-Type': 'application/json' };
const readerHeaders = { Authorization: `Bearer ${signToken({ userId: readerId })}`, 'Content-Type': 'application/json' };
const key = 'cd1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';

const updateAction = (id: number, headers: Record<string, string>, requestKey: string | undefined, body: Record<string, unknown>) => fetch(
  `${baseUrl}/actions/${id}`,
  {
    method: 'PATCH',
    headers: requestKey ? { ...headers, 'X-Idempotency-Key': requestKey } : headers,
    body: JSON.stringify(body),
  },
);
const requestStatus = async (id: number, requestKey: string, headers = actorHeaders) => {
  const response = await fetch(`${baseUrl}/actions/${id}/update-requests/${requestKey}`, { headers });
  return { response, body: await response.json() as { data: { state: string } } };
};
const action = (id: number) => database.queryOne<{ title: string; description_md: string; owner_id: number; due_date: string | null; status: string; result_md: string }>(
  'SELECT title,description_md,owner_id,due_date,status,result_md FROM retro_actions WHERE id=?', [id],
);
const auditCount = (id: number) => database.queryOne<{ count: number }>(
  "SELECT COUNT(*) AS count FROM retro_audit_logs WHERE action='action_update' AND comment=?", [`action=${id}`],
);
const receiptCount = (id: number, requestKey: string) => database.queryOne<{ count: number }>(
  'SELECT COUNT(*) AS count FROM retro_action_update_request_keys WHERE actor_id=? AND action_id=? AND client_request_id=?',
  [actorId, id, requestKey],
);
const ownerNotificationCount = () => database.queryOne<{ count: number }>(
  "SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND title IN ('复盘行动项状态已更新','复盘行动项已更新')", [ownerId],
);
const pauseForNotifications = () => new Promise((resolve) => setTimeout(resolve, 60));

try {
  const payload = {
    status: 'doing',
    resultMd: '已完成第一轮验证',
    title: '  已规范化的行动项标题  ',
    descriptionMd: '已补充完成说明',
    ownerId,
    dueDate: '2026-10-11',
  };
  const concurrent = await Promise.all([
    updateAction(actionId, actorHeaders, key, payload),
    updateAction(actionId, actorHeaders, key, payload),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status), [200, 200], 'same-key concurrent updates both return success');
  await pauseForNotifications();
  assert.equal(Number((await auditCount(actionId))?.count), 1, 'concurrent replay writes one action_update audit');
  assert.equal(Number((await receiptCount(actionId, key))?.count), 1, 'concurrent replay stores one receipt');
  assert.equal(Number((await ownerNotificationCount())?.count), 1, 'only the first successful update notifies');

  const replay = await updateAction(actionId, actorHeaders, key, { ...payload, title: payload.title.trim() });
  assert.equal(replay.status, 200, 'same normalized payload replays successfully');
  const conflictingPayload = await updateAction(actionId, actorHeaders, key, { ...payload, resultMd: '替换为其他结果' });
  assert.equal(conflictingPayload.status, 409, 'same actor/action/key with another normalized payload conflicts');
  assert.equal((await conflictingPayload.json() as { code: string }).code, 'RETRO_ACTION_UPDATE_REQUEST_CONFLICT');
  await pauseForNotifications();
  assert.equal(Number((await auditCount(actionId))?.count), 1, 'replay and payload conflict do not write another audit');
  assert.equal(Number((await ownerNotificationCount())?.count), 1, 'replay and payload conflict do not notify');

  const actorIsolated = await updateAction(actionId, secondActorHeaders, key, { status: 'done', resultMd: '管理员复核完成' });
  assert.equal(actorIsolated.status, 200, 'the same UUID is isolated for another actor');
  assert.deepEqual((await requestStatus(actionId, key, secondActorHeaders)).body.data, { state: 'processed' });
  assert.deepEqual((await requestStatus(actionId, key, actorHeaders)).body.data, { state: 'processed' });
  assert.deepEqual((await requestStatus(actionId, key, readerHeaders)).body.data, { state: 'not_found' }, 'another actor cannot discover the receipt');
  const priorActorReplay = await updateAction(actionId, actorHeaders, key, { ...payload, title: payload.title.trim() });
  assert.equal(priorActorReplay.status, 200, 'a later update by another actor does not change the original receipt fingerprint');
  assert.equal(Number((await auditCount(actionId))?.count), 2, 'actor-isolated replay does not add another audit for the original actor');

  assert.deepEqual((await requestStatus(anotherActionId, key, actorHeaders)).body.data, { state: 'not_found' }, 'the same actor cannot discover a receipt for another action');
  const actionIsolated = await updateAction(anotherActionId, actorHeaders, key, { status: 'doing', resultMd: '另一行动项' });
  assert.equal(actionIsolated.status, 200, 'the same UUID is isolated for another action');
  assert.deepEqual((await requestStatus(anotherActionId, key, actorHeaders)).body.data, { state: 'processed' });
  const wrongActionStatus = await requestStatus(actionId, key, actorHeaders);
  assert.deepEqual(wrongActionStatus.body.data, { state: 'processed' }, 'the original action receipt remains scoped to its action');

  const processedStatus = await requestStatus(actionId, key, actorHeaders);
  assert.equal(processedStatus.response.status, 200);
  assert.equal(processedStatus.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(processedStatus.body.data, { state: 'processed' });
  assert.deepEqual((await requestStatus(actionId, 'ed1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50', actorHeaders)).body.data, { state: 'not_found' });
  const unauthenticatedStatus = await fetch(`${baseUrl}/actions/${actionId}/update-requests/${key}`);
  assert.equal(unauthenticatedStatus.status, 401, 'request status still requires authentication');

  // A compare-and-set conflict is durably recorded so a refreshed client cannot replay stale input.
  const casKey = 'ce1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await pauseForNotifications();
  const conflictMessagesBefore = Number((await ownerNotificationCount())?.count || 0);
  const dbForInterleaving = db as unknown as { execute: (statement: unknown) => Promise<unknown> };
  const originalDbExecute = dbForInterleaving.execute.bind(dbForInterleaving);
  let actionSnapshotRead = () => {};
  let releaseActionSnapshot = () => {};
  const snapshotRead = new Promise<void>((resolve) => { actionSnapshotRead = resolve; });
  const allowSnapshot = new Promise<void>((resolve) => { releaseActionSnapshot = resolve; });
  let interceptedActionSnapshot = false;
  dbForInterleaving.execute = async (statement: unknown) => {
    const statementObject = typeof statement === 'object' && statement !== null
      ? statement as { sql?: unknown; args?: unknown[] }
      : null;
    const result = await originalDbExecute(statement);
    const sql = typeof statement === 'string' ? statement : String(statementObject?.sql || '');
    const args = statementObject?.args || [];
    if (!interceptedActionSnapshot
      && sql.includes('SELECT a.*, r.status AS retro_status')
      && Number(args[0]) === casFailureActionId) {
      interceptedActionSnapshot = true;
      actionSnapshotRead();
      await allowSnapshot;
    }
    return result;
  };
  let casConflict: Response;
  try {
    const pendingConflict = updateAction(casFailureActionId, actorHeaders, casKey, { resultMd: '旧页面提交的结果' });
    await snapshotRead;
    await database.execute('UPDATE retro_actions SET description_md=? WHERE id=?', ['另一个页面刚保存的说明', casFailureActionId]);
    releaseActionSnapshot();
    casConflict = await pendingConflict;
  } finally {
    releaseActionSnapshot();
    dbForInterleaving.execute = originalDbExecute;
  }
  assert.equal(casConflict.status, 409, 'same-status field changes are caught by the full-row CAS');
  assert.equal((await casConflict.json() as { code: string }).code, 'ACTION_CHANGED');
  assert.deepEqual((await action(casFailureActionId)), {
    title: '状态已变化行动项', description_md: '另一个页面刚保存的说明', owner_id: ownerId,
    due_date: null, status: 'todo', result_md: '',
  }, 'a stale update cannot overwrite a concurrent field edit');
  const conflictStatus = await requestStatus(casFailureActionId, casKey, actorHeaders);
  assert.equal(conflictStatus.response.status, 200);
  assert.equal(conflictStatus.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(conflictStatus.body.data, { state: 'conflict' }, 'status query durably reports the definitive CAS conflict');
  assert.deepEqual((await requestStatus(casFailureActionId, casKey, readerHeaders)).body.data, { state: 'not_found' }, 'another actor cannot discover a conflict receipt');
  assert.deepEqual((await requestStatus(anotherActionId, casKey, actorHeaders)).body.data, { state: 'not_found' }, 'another action cannot discover a conflict receipt');
  const sameConflictReplay = await updateAction(casFailureActionId, actorHeaders, casKey, { resultMd: '旧页面提交的结果' });
  assert.equal(sameConflictReplay.status, 409, 'same-key/same-payload replay preserves the original conflict outcome');
  assert.equal((await sameConflictReplay.json() as { code: string }).code, 'ACTION_CHANGED');
  const conflictingRetryPayload = await updateAction(casFailureActionId, actorHeaders, casKey, { resultMd: '刷新后另一个内容' });
  assert.equal(conflictingRetryPayload.status, 409, 'same key with a changed payload remains a request conflict');
  assert.equal((await conflictingRetryPayload.json() as { code: string }).code, 'RETRO_ACTION_UPDATE_REQUEST_CONFLICT');
  assert.equal(Number((await auditCount(casFailureActionId))?.count), 0, 'CAS conflict leaves no audit');
  assert.equal(Number((await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM retro_action_update_request_keys WHERE actor_id=? AND action_id=? AND client_request_id=?',
    [actorId, casFailureActionId, casKey],
  ))?.count), 1, 'CAS conflict atomically persists one recovery receipt');
  assert.equal(String((await database.queryOne<{ outcome: string }>(
    'SELECT outcome FROM retro_action_update_request_keys WHERE actor_id=? AND action_id=? AND client_request_id=?',
    [actorId, casFailureActionId, casKey],
  ))?.outcome), 'conflict', 'the durable receipt stores the conflict outcome');

  await pauseForNotifications();
  assert.equal(Number((await ownerNotificationCount())?.count), conflictMessagesBefore, 'conflict and replay do not send notifications');

  // After permission is revoked and the actor is no longer the owner, read-only recovery remains available.
  await database.execute('DELETE FROM role_permissions WHERE role_id=? AND permission_id=(SELECT id FROM permissions WHERE code=?)', [customRoleId, 'analytics:retro:action_manage']);
  clearPermissionCache(actorId);
  const deniedUpdate = await updateAction(actionId, actorHeaders, 'dd1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50', { status: 'cancelled' });
  assert.equal(deniedUpdate.status, 403, 'the update route still requires action_manage or ownership');
  assert.deepEqual((await requestStatus(actionId, key, actorHeaders)).body.data, { state: 'processed' }, 'status lookup does not require current edit permission');
  assert.deepEqual((await requestStatus(casFailureActionId, casKey, actorHeaders)).body.data, { state: 'conflict' }, 'conflict lookup also remains available without edit permission');

  const auditBefore = Number((await auditCount(auditFailureActionId))?.count || 0);
  const messagesBefore = Number((await ownerNotificationCount())?.count || 0);
  const auditKey = 'cf1a2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  await database.execute(`
    CREATE TRIGGER reject_retro_action_update_audit
    BEFORE INSERT ON retro_audit_logs
    WHEN NEW.action = 'action_update'
    BEGIN SELECT RAISE(ABORT, 'simulated action update audit failure'); END
  `);
  const failedAudit = await updateAction(auditFailureActionId, secondActorHeaders, auditKey, { status: 'doing', resultMd: '不应保存' });
  assert.equal(failedAudit.status, 500, 'audit failure aborts the update request');
  assert.deepEqual(await action(auditFailureActionId), {
    title: '审计失败行动项', description_md: '', owner_id: ownerId, due_date: null, status: 'todo', result_md: '',
  }, 'audit failure rolls back action fields');
  assert.equal(Number((await auditCount(auditFailureActionId))?.count), auditBefore, 'audit failure leaves no action_update audit');
  assert.equal(Number((await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM retro_action_update_request_keys WHERE actor_id=? AND action_id=? AND client_request_id=?',
    [secondActorId, auditFailureActionId, auditKey],
  ))?.count), 0, 'audit failure leaves no receipt');
  assert.deepEqual((await requestStatus(auditFailureActionId, auditKey, secondActorHeaders)).body.data, { state: 'not_found' });
  await database.execute('DROP TRIGGER reject_retro_action_update_audit');
  await pauseForNotifications();
  assert.equal(Number((await ownerNotificationCount())?.count), messagesBefore, 'audit failure does not send a notification');

  // Existing owners can still update status and result after retrospective archival.
  await database.execute("UPDATE retrospectives SET status='archived' WHERE id=?", [retroId]);
  const archivedOwnerUpdate = await updateAction(actionId, ownerHeaders, undefined, { status: 'cancelled', resultMd: '归档后负责人补充结果' });
  assert.equal(archivedOwnerUpdate.status, 200, 'archiving does not remove the existing owner update rule');
  assert.deepEqual(await database.queryOne<{ status: string; result_md: string }>(
    'SELECT status,result_md FROM retro_actions WHERE id=?', [actionId],
  ), { status: 'cancelled', result_md: '归档后负责人补充结果' });
  assert.equal(Number((await auditCount(actionId))?.count), 3, 'legacy owner update keeps its original audit behavior');
  const legacyUpdate = await updateAction(anotherActionId, secondActorHeaders, undefined, { status: 'done', resultMd: '旧客户端路径' });
  assert.equal(legacyUpdate.status, 200, 'legacy clients without an idempotency key remain supported');
  assert.equal(Number((await auditCount(anotherActionId))?.count), 2, 'legacy no-key update writes one audit');

  assert.equal((await database.queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  console.log('Retrospective action update idempotency HTTP tests passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
