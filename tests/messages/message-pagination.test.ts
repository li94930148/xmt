import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-message-pagination-'));
process.env.XMT_DB_PATH = path.join(directory, 'messages.db');
process.env.JWT_SECRET = 'message-pagination-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { default: messagesRoutes } = await import('../../api/routes/messages.js');

await initDatabase();
const ownerId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['message-pagination-owner', 'unused', 'message-owner@example.invalid', 'admin', 'Owner'],
);
const otherUserId = await executeInsert(
  `INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)`,
  ['message-pagination-other', 'unused', 'message-other@example.invalid', 'member', 'Other'],
);

for (let index = 0; index < 45; index += 1) {
  await executeInsert(
    `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
    [ownerId, `Message ${index + 1}`, 'Pagination contract', 'info', index % 3 === 0 ? 1 : 0, index % 2 === 0 ? '/topics/1' : null, '2026-09-28 12:00:00'],
  );
}
await executeInsert(
  `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
  [otherUserId, 'Private message 1', 'must not leak', 'info', 0, '/topics/99', '2026-09-28 12:00:00'],
);
await executeInsert(
  `INSERT INTO messages(user_id,title,content,type,read,link,created_at) VALUES(?,?,?,?,?,?,?)`,
  [otherUserId, 'Private message 2', 'must not leak', 'info', 0, null, '2026-09-28 12:00:00'],
);

const app = express();
app.use(express.json());
app.use('/api/messages', messagesRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/messages`;
const headers = { Authorization: `Bearer ${signToken({ userId: ownerId })}`, 'Content-Type': 'application/json' };

async function getList(query: string) {
  const response = await fetch(`${base}${query ? `?${query}` : ''}`, { headers });
  assert.equal(response.status, 200);
  return response.json() as Promise<{
    data: Array<{ id: number; user_id: number; link?: string | null; read: number | boolean }>;
    total: number;
    page: number;
    limit: number;
    summary: { total: number; unread: number; actionable: number };
  }>;
}

try {
  const pageTwo = await getList('page=2&limit=20');
  assert.equal(pageTwo.total, 45);
  assert.equal(pageTwo.page, 2);
  assert.equal(pageTwo.limit, 20);
  assert.equal(pageTwo.data.length, 20);
  assert.equal(new Set(pageTwo.data.map((message) => message.id)).size, 20, 'page order remains stable when timestamps tie');
  assert.ok(pageTwo.data.every((message) => message.user_id === ownerId), 'rows from other users never enter a page');
  assert.deepEqual(pageTwo.summary, { total: 45, unread: 30, actionable: 15 }, 'global counters use only the authenticated user and ignore current page');

  const unread = await getList('page=1&limit=20&read=unread');
  assert.equal(unread.total, 30);
  assert.equal(unread.data.length, 20);
  assert.ok(unread.data.every((message) => !message.read));

  const linked = await getList('link=present');
  assert.equal(linked.total, 23);
  assert.ok(linked.data.every((message) => Boolean(message.link?.trim())));

  const system = await getList('link=absent');
  assert.equal(system.total, 22);
  assert.ok(system.data.every((message) => !message.link?.trim()));

  const unreadLinked = await getList('read=unread&link=present');
  assert.equal(unreadLinked.total, 15);
  assert.ok(unreadLinked.data.every((message) => !message.read && Boolean(message.link?.trim())));

  const invalidPage = await getList('page=0&limit=invalid');
  assert.equal(invalidPage.page, 1, 'invalid pagination values safely fall back to defaults');
  assert.equal(invalidPage.limit, 20);
  const cappedLimit = await getList('page=1&limit=1000');
  assert.equal(cappedLimit.limit, 100, 'requested page size is capped');
  assert.equal(cappedLimit.data.length, 45);

  const ownerUnread = await queryOne<{ id: number }>(`SELECT id FROM messages WHERE user_id=? AND read=0 ORDER BY id LIMIT 1`, [ownerId]);
  const ownerRead = await queryOne<{ id: number }>(`SELECT id FROM messages WHERE user_id=? AND read=1 ORDER BY id LIMIT 1`, [ownerId]);
  const otherMessage = await queryOne<{ id: number }>(`SELECT id FROM messages WHERE user_id=? ORDER BY id LIMIT 1`, [otherUserId]);
  assert(ownerUnread && ownerRead && otherMessage);

  const malformedIds = await fetch(`${base}/read-all`, { method: 'POST', headers, body: JSON.stringify({ ids: 'not-an-array' }) });
  assert.equal(malformedIds.status, 400, 'malformed selected IDs are rejected instead of falling through to mark-all');
  const malformedBody = await fetch(`${base}/read-all`, { method: 'POST', headers, body: JSON.stringify(['unexpected', 'array']) });
  assert.equal(malformedBody.status, 400, 'non-object JSON bodies are rejected instead of falling through to mark-all');
  const invalidIds = await fetch(`${base}/read-all`, { method: 'POST', headers, body: JSON.stringify({ ids: [ownerUnread.id, 0] }) });
  assert.equal(invalidIds.status, 400, 'invalid IDs reject the whole request without partially marking messages');
  assert.equal(Number((await queryOne<{ read: number }>(`SELECT read FROM messages WHERE id=? AND user_id=?`, [ownerUnread.id, ownerId]))?.read), 0);

  const selectedReadResponse = await fetch(`${base}/read-all`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids: [ownerUnread.id, ownerUnread.id, ownerRead.id, otherMessage.id, 99999999] }),
  });
  assert.equal(selectedReadResponse.status, 200);
  assert.deepEqual(await selectedReadResponse.json(), {
    message: '已确认 2 条消息为已读',
    requestedCount: 5,
    distinctCount: 4,
    matchedCount: 2,
    updatedCount: 1,
    ignoredCount: 2,
  }, 'selected bulk read reports unique, account-scoped, actually changed counts');

  const secondOwnerUnread = await queryOne<{ id: number }>(`SELECT id FROM messages WHERE user_id=? AND read=0 ORDER BY id LIMIT 1`, [ownerId]);
  assert(secondOwnerUnread);
  const singleRead = await fetch(`${base}/${secondOwnerUnread.id}`, { method: 'PUT', headers });
  assert.equal(singleRead.status, 200, 'single-message read uses an account-scoped update');
  assert.deepEqual(await singleRead.json(), { message: '消息已标记为已读' });
  const foreignSingleRead = await fetch(`${base}/${otherMessage.id}`, { method: 'PUT', headers });
  assert.equal(foreignSingleRead.status, 404, 'single-message read does not expose another account message');
  assert.equal(Number((await queryOne<{ read: number }>(`SELECT read FROM messages WHERE id=? AND user_id=?`, [otherMessage.id, otherUserId]))?.read), 0);

  const allRead = await fetch(`${base}/read-all`, { method: 'POST', headers, body: JSON.stringify({}) });
  assert.equal(allRead.status, 200);
  assert.deepEqual(await allRead.json(), { message: '所有消息已标记为已读', updatedCount: 28 });
  const afterRead = await getList('page=2&limit=20');
  assert.deepEqual(afterRead.summary, { total: 45, unread: 0, actionable: 0 }, 'bulk read updates the account-wide counters across all pages');
  const otherUnread = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND read=0`, [otherUserId]);
  assert.equal(otherUnread?.count, 2, 'bulk read cannot modify another account');

  console.log('message pagination, filtering, summary scope, and bulk-read tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
