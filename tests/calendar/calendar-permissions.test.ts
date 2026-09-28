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
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
}

const originalFetch = globalThis.fetch;
try {
  const { getCalendarEvents } = await import('../../src/api/calendar.js');
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ data: 'not-an-array' }) }) as Response) as typeof fetch;
  await assert.rejects(getCalendarEvents({ year: 2026, month: 10 }), /日历数据格式不正确/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('calendar-permissions tests passed');
