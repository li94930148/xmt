import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-resource-relations-'));
process.env.XMT_DB_PATH = path.join(tempDir, 'production-resources.test.db');
process.env.JWT_SECRET = 'production-resource-relations-test-secret';

const [{ default: app }, { initDatabase }, database, { signToken }] = await Promise.all([
  import('../api/app.js'), import('../api/database/db.js'), import('../api/database/utils.js'), import('../api/utils/jwt.js'),
]);
await initDatabase();
const now = '2026-07-30 11:00:00';
const adminId = await database.executeInsert(`INSERT INTO users(username,password,role,name,enabled,created_at,updated_at) VALUES('e2_admin','unused','admin','E2管理员',1,?,?)`, [now, now]);
const editorId = await database.executeInsert(`INSERT INTO users(username,password,role,name,enabled,created_at,updated_at) VALUES('e2_editor','unused','editor','E2编辑',1,?,?)`, [now, now]);
const memberId = await database.executeInsert(`INSERT INTO users(username,password,role,name,enabled,created_at,updated_at) VALUES('e2_member','unused','member','E2查看者',1,?,?)`, [now, now]);
for (const [userId, role] of [[adminId, 'admin'], [editorId, 'editor'], [memberId, 'member']] as const) await database.execute(`INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?`, [userId, role]);
const topicId = await database.executeInsert(`INSERT INTO topics(title,status,creator_id,assignee_id,created_at,updated_at) VALUES('生产引用测试','production',?,?,?,?)`, [editorId, editorId, now, now]);
const productionId = await database.executeInsert(`INSERT INTO production(topic_id,version,content,content_markdown,content_json,status,operator_id,created_at,updated_at) VALUES(?,'v1.0','原始正文','原始正文','原始正文','draft',?,?,?)`, [topicId, editorId, now, now]);
const resourceId = await database.executeInsert(`INSERT INTO resources(name,type,title,library_type,visibility,status,uploader_id,owner_id,created_by,created_at,updated_at) VALUES('泰山参考资料','txt','泰山参考资料','knowledge','team','published',?,?,?,?,?)`, [adminId, adminId, adminId, now, now]);

const tokens = {
  admin: signToken({ userId: adminId, username: 'e2_admin', role: 'admin' }),
  editor: signToken({ userId: editorId, username: 'e2_editor', role: 'editor' }),
  member: signToken({ userId: memberId, username: 'e2_member', role: 'member' }),
};
const headers = (role: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[role]}`, 'Content-Type': 'application/json' });
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const relationUrl = `${origin}/api/productions/${productionId}/resources`;

try {
  const before = await database.queryOne<{ version: string; content: string }>('SELECT version,content FROM production WHERE id=?', [productionId]);
  const editorAdd = await fetch(relationUrl, { method: 'POST', headers: headers('editor'), body: JSON.stringify({ resource_id: resourceId }) });
  assert.equal(editorAdd.status, 201, '编辑角色应可添加参考资料');
  const viewerList = await fetch(relationUrl, { headers: headers('member') });
  assert.equal(viewerList.status, 200, '普通查看用户应可查看参考资料');
  const viewerAdd = await fetch(relationUrl, { method: 'POST', headers: headers('member'), body: JSON.stringify({ resource_id: resourceId }) });
  assert.equal(viewerAdd.status, 403, '普通查看用户不能添加参考资料');
  const afterRelation = await database.queryOne<{ version: string; content: string }>('SELECT version,content FROM production WHERE id=?', [productionId]);
  assert.deepEqual(afterRelation, before, '关联资料不能修改正文或版本');
  assert.equal(Number((await database.queryOne<{ total: number }>('SELECT COUNT(*) total FROM production_history WHERE production_id=?', [productionId]))?.total), 0, '关联资料不能生成版本历史');

  const editorRemove = await fetch(`${relationUrl}/${resourceId}`, { method: 'DELETE', headers: headers('editor') });
  assert.equal(editorRemove.status, 200, '编辑角色应可解除关联');
  assert.equal(Number((await database.queryOne<{ total: number }>('SELECT COUNT(*) total FROM resources WHERE id=?', [resourceId]))?.total), 1, '解除关联不能删除资料');
  const adminAdd = await fetch(relationUrl, { method: 'POST', headers: headers('admin'), body: JSON.stringify({ resource_id: resourceId }) });
  assert.equal(adminAdd.status, 201, '管理员应保持添加能力');

  const save = await fetch(`${origin}/api/workflow/production/${productionId}`, { method: 'PUT', headers: headers('editor'), body: JSON.stringify({ topic_id: topicId, version: 'v1.0', content: '更新正文', status: 'draft', version_action: 'major' }) });
  assert.equal(save.status, 200, '生产编辑保存流程应正常');
  assert.equal(Number((await database.queryOne<{ total: number }>('SELECT COUNT(*) total FROM production_history WHERE production_id=?', [productionId]))?.total), 1, '版本历史应正常生成');
  console.log(JSON.stringify({ passed: true, cases: 6, productionId, resourceId }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
