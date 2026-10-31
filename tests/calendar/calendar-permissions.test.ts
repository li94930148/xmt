import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-calendar-access-'));
process.env.XMT_DB_PATH = path.join(directory, 'calendar.db');
process.env.JWT_SECRET = 'calendar-access-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: calendarRoutes } = await import('../../api/routes/calendar.js');

await initDatabase();

async function createUser(username: string, role: string) {
  return executeInsert(
    `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
    [username, 'unused', `${username}@example.invalid`, role, username],
  );
}

const ownerId = await createUser('calendar-owner', 'calendar_member');
const outsiderId = await createUser('calendar-outsider', 'calendar_member');
const adminId = await createUser('calendar-admin', 'admin');
const ownerTopicId = await executeInsert(
  `INSERT INTO topics(title,description,platform,deadline,creator_id,assignee_id,status) VALUES('我的排期选题','test','douyin','2026-10-04',?,?,'production')`,
  [ownerId, ownerId],
);
const otherTopicId = await executeInsert(
  `INSERT INTO topics(title,description,platform,deadline,creator_id,assignee_id,status) VALUES('他人的排期选题','test','douyin','2026-10-05',?,?,'production')`,
  [outsiderId, outsiderId],
);

const app = express();
app.use(express.json());
app.use('/api/calendar', calendarRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/calendar`;
const headers = (userId: number) => ({ authorization: `Bearer ${signToken({ userId })}`, 'content-type': 'application/json' });

try {
  const unauthenticated = await fetch(base);
  assert.equal(unauthenticated.status, 401, 'calendar routes require authentication');

  const ownerCreate = await fetch(base, {
    method: 'POST', headers: headers(ownerId),
    body: JSON.stringify({ title: '我的日历事件', event_date: '2026-10-01', topic_id: ownerTopicId }),
  });
  assert.equal(ownerCreate.status, 200);
  const ownerEventId = (await ownerCreate.json() as { id: number }).id;

  const unlinkedCreate = await fetch(base, {
    method: 'POST', headers: headers(ownerId),
    body: JSON.stringify({ title: '个人未关联事件', event_date: '2026-10-02' }),
  });
  assert.equal(unlinkedCreate.status, 200, 'authenticated members may create unlinked personal calendar events');
  const unlinkedId = (await unlinkedCreate.json() as { id: number }).id;

  const crossTopicCreate = await fetch(base, {
    method: 'POST', headers: headers(ownerId),
    body: JSON.stringify({ title: '越权关联', event_date: '2026-10-03', topic_id: otherTopicId }),
  });
  assert.equal(crossTopicCreate.status, 403, 'users without topic access cannot create linked events');

  const ownerList = await fetch(`${base}?year=2026&month=10`, { headers: headers(ownerId) });
  assert.equal(ownerList.status, 200);
  const ownerRows = (await ownerList.json() as { data: Array<{ id: number; source_type?: string; topic_id?: number }> }).data;
  assert(ownerRows.some((row) => row.id === ownerEventId && row.source_type === 'event'));
  assert(ownerRows.some((row) => row.id === ownerTopicId && row.source_type === 'topic'), 'users can see deadlines for topics they own or are assigned');
  assert(!ownerRows.some((row) => row.id === otherTopicId && row.source_type === 'topic'), 'unrelated topic deadlines stay hidden');

  const ownUpdate = await fetch(`${base}/${ownerEventId}`, {
    method: 'PUT', headers: headers(ownerId), body: JSON.stringify({ title: '本人更新' }),
  });
  assert.equal(ownUpdate.status, 200);
  const deniedUpdate = await fetch(`${base}/${ownerEventId}`, {
    method: 'PUT', headers: headers(outsiderId), body: JSON.stringify({ title: '越权更新' }),
  });
  assert.equal(deniedUpdate.status, 403);

  const deniedDelete = await fetch(`${base}/${unlinkedId}`, { method: 'DELETE', headers: headers(outsiderId) });
  assert.equal(deniedDelete.status, 403);
  const ownerDelete = await fetch(`${base}/${unlinkedId}`, { method: 'DELETE', headers: headers(ownerId) });
  assert.equal(ownerDelete.status, 200);
  const retained = await queryOne<{ id: number }>(`SELECT id FROM calendar_events WHERE id = ?`, [ownerEventId]);
  assert(retained, 'owner cannot accidentally delete a separate linked event while removing their unlinked event');

  const adminDelete = await fetch(`${base}/${ownerEventId}`, { method: 'DELETE', headers: headers(adminId) });
  assert.equal(adminDelete.status, 200, 'privileged admins can manage calendar events');

  const createRequestId = 'a01b2c3d-4e5f-4678-8a9b-0c1d2e3f4a50';
  const createPayload = { title: '可安全重放的日历事件', description: '同一请求不应创建第二条', event_date: '2026-10-06', event_type: 'meeting' };
  const idempotentCreate = () => fetch(base, {
    method: 'POST', headers: headers(ownerId),
    body: JSON.stringify({ ...createPayload, client_request_id: createRequestId }),
  });
  const firstCreate = await idempotentCreate();
  assert.equal(firstCreate.status, 200);
  const firstResult = await firstCreate.json() as { id: number; idempotent_replay?: boolean };
  assert.equal(firstResult.idempotent_replay, false);
  const replayCreate = await idempotentCreate();
  assert.equal(replayCreate.status, 200, 'same account and payload safely replay the same create request');
  const replayResult = await replayCreate.json() as { id: number; idempotent_replay?: boolean };
  assert.equal(replayResult.id, firstResult.id);
  assert.equal(replayResult.idempotent_replay, true);

  const conflictingReplay = await fetch(base, {
    method: 'POST', headers: headers(ownerId),
    body: JSON.stringify({ ...createPayload, title: '不同内容不能复用请求编号', client_request_id: createRequestId }),
  });
  assert.equal(conflictingReplay.status, 409, 'reusing a request ID for a different payload is rejected');
  const ownerStatus = await fetch(`${base}/create-request/${createRequestId}`, { headers: headers(ownerId) });
  assert.equal(ownerStatus.status, 200);
  assert.equal(ownerStatus.headers.get('Cache-Control'), 'no-store', 'confirmed creation status must not be cached');
  assert.equal((await ownerStatus.json() as { eventId: number }).eventId, firstResult.id);
  const outsiderStatus = await fetch(`${base}/create-request/${createRequestId}`, { headers: headers(outsiderId) });
  assert.equal(outsiderStatus.status, 404, 'create status cannot reveal another account\'s event');
  assert.equal(outsiderStatus.headers.get('Cache-Control'), 'no-store', 'owner-scoped missing status must not be cached');
  const invalidStatus = await fetch(`${base}/create-request/not-a-uuid`, { headers: headers(ownerId) });
  assert.equal(invalidStatus.status, 400);
  assert.equal(invalidStatus.headers.get('Cache-Control'), 'no-store', 'invalid status responses must not be cached');
  const unauthenticatedStatus = await fetch(`${base}/create-request/${createRequestId}`);
  assert.equal(unauthenticatedStatus.status, 401);
  assert.equal(unauthenticatedStatus.headers.get('Cache-Control'), 'no-store', 'authentication failures must not be cached');
  const createdCount = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM calendar_events WHERE title=? AND creator_id=?`,
    [createPayload.title, ownerId],
  );
  assert.equal(Number(createdCount?.total), 1, 'replay leaves exactly one calendar event');

  const deleteIdempotentEvent = await fetch(`${base}/${firstResult.id}`, { method: 'DELETE', headers: headers(adminId) });
  assert.equal(deleteIdempotentEvent.status, 200);
  const deletedStatus = await fetch(`${base}/create-request/${createRequestId}`, { headers: headers(ownerId) });
  assert.equal(deletedStatus.status, 410, 'deleted request remains a tombstone');
  assert.equal(deletedStatus.headers.get('Cache-Control'), 'no-store', 'deleted status tombstones must not be cached');
  const deletedReplay = await idempotentCreate();
  assert.equal(deletedReplay.status, 410, 'a late replay cannot recreate a deleted calendar event');
  const noResurrection = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM calendar_events WHERE title=? AND creator_id=?`,
    [createPayload.title, ownerId],
  );
  assert.equal(Number(noResurrection?.total), 0);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
}

const originalFetch = globalThis.fetch;
try {
  const { getCalendarEvents, getCalendarEventCreateStatus } = await import('../../src/api/calendar.js');
  let statusRequestInit: RequestInit | undefined;
  globalThis.fetch = (async (_input, init) => {
    statusRequestInit = init;
    return { ok: true, status: 200, json: async () => ({ eventId: 32 }) } as Response;
  }) as typeof fetch;
  assert.deepEqual(await getCalendarEventCreateStatus('a01b2c3d-4e5f-4678-8a9b-0c1d2e3f4a50'), { status: 'created', eventId: 32 });
  assert.equal(statusRequestInit?.cache, 'no-store', 'client recovery reads must bypass the browser cache');
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ data: 'not-an-array' }) }) as Response) as typeof fetch;
  await assert.rejects(getCalendarEvents({ year: 2026, month: 10 }), /日历数据格式不正确/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('calendar-permissions tests passed');
