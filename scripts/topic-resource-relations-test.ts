import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-topic-resource-relations-'));
process.env.XMT_DB_PATH = path.join(tempDir, 'topic-resources.test.db');
process.env.JWT_SECRET = 'topic-resource-relations-test-secret';

const [{ default: app }, { initDatabase }, database, { signToken }] = await Promise.all([
  import('../api/app.js'), import('../api/database/db.js'), import('../api/database/utils.js'), import('../api/utils/jwt.js'),
]);
await initDatabase();

const now = '2026-07-30 10:00:00';
const adminId = await database.executeInsert(`INSERT INTO users(username,password,role,name,enabled,created_at,updated_at) VALUES('permission_admin','unused','admin','权限管理员',1,?,?)`, [now, now]);
const editorId = await database.executeInsert(`INSERT INTO users(username,password,role,name,enabled,created_at,updated_at) VALUES('permission_editor','unused','editor','普通编辑',1,?,?)`, [now, now]);
await database.execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='admin'`, [adminId]);
await database.execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='editor'`, [editorId]);
const topicId = await database.executeInsert(`INSERT INTO topics(title,status,creator_id,assignee_id,created_at,updated_at) VALUES('泰山选题','pending',?,?,?,?)`, [editorId, editorId, now, now]);
const resourceId = await database.executeInsert(`INSERT INTO resources(name,type,title,summary,content_text,library_type,visibility,status,uploader_id,owner_id,created_by,created_at,updated_at) VALUES('山东地情资料','txt','山东地情资料','泰山历史','山东地情 泰山历史文化','knowledge','team','published',?,?,?, ?, ?)`, [adminId, adminId, adminId, now, now]);

const adminToken = signToken({ userId: adminId, username: 'permission_admin', role: 'admin' });
const editorToken = signToken({ userId: editorId, username: 'permission_editor', role: 'editor' });
const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
const editorHeaders = { Authorization: `Bearer ${editorToken}`, 'Content-Type': 'application/json' };
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const topicResourcesUrl = `${origin}/api/topics/${topicId}/resources`;

try {
  const search = await fetch(`${origin}/api/resource-center/search?keyword=${encodeURIComponent('山东地情')}`, { headers: editorHeaders });
  assert.equal(search.status, 200, '普通编辑应可搜索团队资料');
  const searchBody = await search.json() as { data: Array<{ resource_id: number }> };
  assert.ok(searchBody.data.some((item) => Number(item.resource_id) === resourceId));

  const detail = await fetch(`${origin}/api/resource-center/resources/${resourceId}`, { headers: editorHeaders });
  assert.equal(detail.status, 200, '普通编辑应可查看团队资料详情');

  const added = await fetch(topicResourcesUrl, { method: 'POST', headers: editorHeaders, body: JSON.stringify({ resource_id: resourceId }) });
  assert.equal(added.status, 201, '普通编辑应可关联资料到自己可编辑的选题');

  const updateDenied = await fetch(`${origin}/api/resource-center/resources/${resourceId}`, { method: 'PUT', headers: editorHeaders, body: JSON.stringify({ title: '越权修改' }) });
  assert.equal(updateDenied.status, 403, '普通编辑不能修改不属于自己的资料');
  const deleteDenied = await fetch(`${origin}/api/resource-center/resources/${resourceId}`, { method: 'DELETE', headers: editorHeaders });
  assert.equal(deleteDenied.status, 403, '普通编辑不能删除不属于自己的资料');

  const adminUpdate = await fetch(`${origin}/api/resource-center/resources/${resourceId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ summary: '管理员更新' }) });
  assert.equal(adminUpdate.status, 200, '管理员应保持资料管理能力');
  const removed = await fetch(`${topicResourcesUrl}/${resourceId}`, { method: 'DELETE', headers: editorHeaders });
  assert.equal(removed.status, 200, '选题编辑者应可解除关联');
  assert.equal(Number((await database.queryOne<{ total: number }>('SELECT COUNT(*) total FROM resources WHERE id=?', [resourceId]))?.total), 1);

  console.log(JSON.stringify({ passed: true, cases: 6, topicId, resourceId }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
