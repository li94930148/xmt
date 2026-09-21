import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-production-collaboration-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'test.db');
process.env.JWT_SECRET = 'production-collaboration-test-secret';

const [{ default: app }, { initDatabase, closeDatabase }, database, { signToken }] = await Promise.all([
  import('../../api/app.js'), import('../../api/database/db.js'), import('../../api/database/utils.js'), import('../../api/utils/jwt.js'),
]);
await initDatabase();
const userId = await database.executeInsert("INSERT INTO users(username,password,role,name,enabled) VALUES('collaboration_editor','unused','editor','编辑测试',1)");
await database.execute("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='editor'", [userId]);
const secondUserId = await database.executeInsert("INSERT INTO users(username,password,role,name,enabled) VALUES('collaboration_editor_two','unused','editor','协作同事',1)");
await database.execute("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='editor'", [secondUserId]);
const topicId = await database.executeInsert("INSERT INTO topics(title,status,creator_id,assignee_id) VALUES('协同保存测试','production',?,?)", [userId, userId]);
const productionId = await database.executeInsert("INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','原稿','draft',?)", [topicId, userId]);
const token = signToken({ userId, username: 'collaboration_editor', role: 'editor' });
const secondToken = signToken({ userId: secondUserId, username: 'collaboration_editor_two', role: 'editor' });
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const url = `http://127.0.0.1:${address.port}/api/workflow/production/${productionId}`;
const save = (body: Record<string, unknown>, actorToken = token) => fetch(url, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${actorToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ topic_id: topicId, version: 'v1.0', status: 'draft', ...body }),
});
const current = () => database.queryOne<{ version: string; content: string }>('SELECT version,content FROM production WHERE id=?', [productionId]);
const historyCount = async () => Number((await database.queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM production_history WHERE production_id=?', [productionId]))?.total || 0);

try {
  assert.equal((await save({ content: '普通粘贴后的正文', expected_content: '原稿' })).status, 200);
  assert.deepEqual(await current(), { version: 'v1.0', content: '普通粘贴后的正文' });
  assert.equal(await historyCount(), 0, 'ordinary update must not create a version');

  assert.equal((await save({ content: '普通粘贴后的正文，包含两位同事的修改', expected_content: '普通粘贴后的正文', version_action: 'none' }, secondToken)).status, 200);
  assert.deepEqual(await current(), { version: 'v1.0', content: '普通粘贴后的正文，包含两位同事的修改' });
  const lastOperator = await database.queryOne<{ operator_id: number; operator_name: string }>('SELECT p.operator_id, u.name AS operator_name FROM production p LEFT JOIN users u ON u.id=p.operator_id WHERE p.id=?', [productionId]);
  assert.deepEqual(lastOperator, { operator_id: secondUserId, operator_name: '协作同事' });

  assert.equal((await save({ content: '普通粘贴后的正文，包含两位同事的修改', expected_content: '原稿', version_action: 'none' })).status, 200, 'same merged content is idempotent');

  assert.equal((await save({ content: '旧页面内容', expected_content: '原稿' })).status, 409);
  assert.deepEqual(await current(), { version: 'v1.0', content: '普通粘贴后的正文，包含两位同事的修改' });

  assert.equal((await save({ content: '正式新版本', expected_content: '普通粘贴后的正文，包含两位同事的修改', version_action: 'major' })).status, 200);
  assert.deepEqual(await current(), { version: 'v2.0', content: '正式新版本' });
  assert.equal(await historyCount(), 1);
  assert.equal((await save({ content: '旧版本继续覆盖', expected_content: '普通粘贴后的正文' })).status, 409);
  console.log('production collaboration HTTP tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
