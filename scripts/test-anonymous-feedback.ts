import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-anonymous-feedback-'));
process.env.XMT_DB_PATH = path.join(tempDir, 'test.db');
process.env.JWT_SECRET = 'anonymous-feedback-contract-test-secret';

const [{ default: app }, { initDatabase, db }, { executeInsert, queryOne }, { signToken }] = await Promise.all([
  import('../api/app.js'),
  import('../api/database/db.js'),
  import('../api/database/utils.js'),
  import('../api/utils/jwt.js'),
]);

await initDatabase();
const columns = await db.execute(`PRAGMA table_info(anonymous_feedback)`);
assert.deepEqual(columns.rows.map((row) => String(row.name)), ['id', 'type', 'content', 'need_reply', 'reply_content', 'status', 'created_at', 'updated_at']);

const now = '2026-07-28 12:00:00';
const memberId = await executeInsert(`INSERT INTO users (username, password, role, name, enabled, created_at, updated_at) VALUES (?, ?, 'member', '成员', 1, ?, ?)`, ['feedback_member', 'unused', now, now]);
const adminId = await executeInsert(`INSERT INTO users (username, password, role, name, enabled, created_at, updated_at) VALUES (?, ?, 'admin', '管理员', 1, ?, ?)`, ['feedback_admin', 'unused', now, now]);
const memberToken = signToken({ userId: memberId, username: 'feedback_member', role: 'member' });
const adminToken = signToken({ userId: adminId, username: 'feedback_admin', role: 'admin' });

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/anonymous-feedback`;

try {
  const unauthenticated = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'feature', content: '测试', needReply: false }) });
  assert.equal(unauthenticated.status, 401);

  const submitted = await fetch(base, { method: 'POST', headers: { Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'process', content: '简化发布审批', needReply: true }) });
  assert.equal(submitted.status, 201);
  const stored = await queryOne<Record<string, unknown>>(`SELECT * FROM anonymous_feedback`);
  assert(stored);
  assert.equal(Object.hasOwn(stored, 'user_id'), false);
  assert.equal(stored.content, '简化发布审批');

  const memberPublicList = await fetch(base, { headers: { Authorization: `Bearer ${memberToken}` } });
  assert.equal(memberPublicList.status, 200);
  const memberPublicPayload = await memberPublicList.json() as { data: Array<Record<string, unknown>> };
  assert.equal(memberPublicPayload.data.length, 1);
  assert.equal(memberPublicPayload.data[0].content, '简化发布审批');
  assert.equal(Object.hasOwn(memberPublicPayload.data[0], 'user_id'), false);
  assert.equal(Object.hasOwn(memberPublicPayload.data[0], 'status'), false);

  const memberList = await fetch(`${base}/admin`, { headers: { Authorization: `Bearer ${memberToken}` } });
  assert.equal(memberList.status, 403);
  const adminList = await fetch(`${base}/admin`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(adminList.status, 200);

  const updated = await fetch(`${base}/admin/${stored.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done', reply_content: '已纳入优化计划' }) });
  assert.equal(updated.status, 200);
  const repliedPublicList = await fetch(base, { headers: { Authorization: `Bearer ${memberToken}` } });
  const repliedPublicPayload = await repliedPublicList.json() as { data: Array<Record<string, unknown>> };
  assert.equal(repliedPublicPayload.data[0].reply_content, '已纳入优化计划');
  const removed = await fetch(`${base}/admin/${stored.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(removed.status, 200);
  console.log('匿名意见箱迁移与 API 权限测试通过');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
