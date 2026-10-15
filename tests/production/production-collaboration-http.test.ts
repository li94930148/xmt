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
const directorId = await database.executeInsert("INSERT INTO users(username,password,role,name,enabled) VALUES('collaboration_director','unused','director','负责人只读测试',1)");
await database.execute("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='director'", [directorId]);
const topicId = await database.executeInsert("INSERT INTO topics(title,status,creator_id,assignee_id) VALUES('协同保存测试','production',?,?)", [userId, userId]);
const productionId = await database.executeInsert("INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','原稿','draft',?)", [topicId, userId]);
const token = signToken({ userId, username: 'collaboration_editor', role: 'editor' });
const secondToken = signToken({ userId: secondUserId, username: 'collaboration_editor_two', role: 'editor' });
const directorToken = signToken({ userId: directorId, username: 'collaboration_director', role: 'director' });
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
const read = (actorToken: string) => fetch(url, { headers: { Authorization: `Bearer ${actorToken}` } });
const current = () => database.queryOne<{ version: string; content: string }>('SELECT version,content FROM production WHERE id=?', [productionId]);
const historyCount = async () => Number((await database.queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM production_history WHERE production_id=?', [productionId]))?.total || 0);
const exactHistory = async (version: string) => fetch(`${url}/history?version=${encodeURIComponent(version)}`, { headers: { Authorization: `Bearer ${token}` } });

try {
  const editorDetail = await read(token);
  assert.equal(editorDetail.status, 200);
  assert.equal((await editorDetail.json() as { can_edit: boolean }).can_edit, true, 'content editor scope is reflected in the detail capability');
  const directorDetail = await read(directorToken);
  assert.equal(directorDetail.status, 200, 'director can view all content under the current access model');
  assert.equal((await directorDetail.json() as { can_edit: boolean }).can_edit, false, 'view access and update permission do not override production ownership scope');
  assert.equal((await save({ content: '越权编辑', expected_content: '原稿' }, directorToken)).status, 403, 'server still rejects an out-of-scope director write');

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

  await database.execute(
    `INSERT INTO production_material_drafts(production_id,content_html,revision,created_by,updated_by) VALUES(?,?,1,?,?)`,
    [productionId, '<p>v1.0 资料历史快照</p>', userId, userId],
  );
  assert.equal((await save({ content: '正式新版本', expected_content: '普通粘贴后的正文，包含两位同事的修改', version_action: 'major' })).status, 200);
  assert.deepEqual(await current(), { version: 'v2.0', content: '正式新版本' });
  assert.equal(await historyCount(), 1);
  const v1Snapshot = await database.queryOne<{ material_draft_snapshot_html: string | null }>(
    'SELECT material_draft_snapshot_html FROM production_history WHERE production_id=? AND version=?',
    [productionId, 'v1.0'],
  );
  assert.equal(v1Snapshot?.material_draft_snapshot_html, '<p>v1.0 资料历史快照</p>', 'version history captures the associated material draft in the same transaction');
  const v1HistoryResponse = await exactHistory('v1.0');
  assert.equal(v1HistoryResponse.status, 200);
  assert.equal((await v1HistoryResponse.json() as { data: Array<{ material_draft_snapshot_html: string }> }).data[0]?.material_draft_snapshot_html, '<p>v1.0 资料历史快照</p>', 'exact history responses include the version-scoped material snapshot');
  assert.equal((await save({ content: '旧版本继续覆盖', expected_content: '普通粘贴后的正文' })).status, 409);

  assert.equal((await save({ version: 'v2.0', content: '正式新版本', expected_content: '正式新版本', status: 'review', version_action: 'none' })).status, 200);
  assert.deepEqual(
    await database.queryOne<{ status: string; version: string }>('SELECT status,version FROM production WHERE id=?', [productionId]),
    { status: 'review', version: 'v2.0' },
    'status-only changes must not create a content version',
  );
  assert.equal(await historyCount(), 1);
  const reviewStatusHistory = await database.queryOne<{ action: string; comment: string; operator_id: number }>(
    `SELECT action,comment,operator_id FROM topic_history WHERE topic_id=? AND action='production_status_changed' ORDER BY id DESC LIMIT 1`,
    [topicId],
  );
  assert.equal(reviewStatusHistory?.action, 'production_status_changed');
  assert.match(reviewStatusHistory?.comment || '', /创作记录 #\d+ 状态由「草稿」变更为「审核中」/);
  assert.equal(reviewStatusHistory?.operator_id, userId);
  assert.equal(
    Number((await database.queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM activity_log WHERE target='production' AND user_id=? AND detail LIKE ?`, [userId, '%草稿%审核中%']))?.total || 0),
    1,
  );

  await database.execute(`CREATE TRIGGER block_production_status_audit_test BEFORE INSERT ON activity_log
    WHEN NEW.target='production' BEGIN SELECT RAISE(ABORT, 'simulated production audit failure'); END`);
  const failedApproval = await save({
    version: 'v2.0',
    content: '正式新版本',
    expected_content: '正式新版本',
    status: 'approved',
    version_action: 'none',
  });
  assert.equal(failedApproval.status, 500);
  assert.equal((await database.queryOne<{ status: string }>('SELECT status FROM production WHERE id=?', [productionId]))?.status, 'review');
  assert.equal((await database.queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [topicId]))?.status, 'production');
  assert.equal(await database.queryOne('SELECT id FROM shooting WHERE topic_id=?', [topicId]), null);
  assert.equal(
    Number((await database.queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM topic_history WHERE topic_id=? AND action='production_status_changed'`, [topicId]))?.total || 0),
    1,
  );
  await database.execute('DROP TRIGGER block_production_status_audit_test');

  assert.equal((await save({
    version: 'v2.0',
    content: '正式新版本',
    expected_content: '正式新版本',
    status: 'approved',
    version_action: 'none',
  })).status, 200);
  assert.equal((await database.queryOne<{ status: string }>('SELECT status FROM production WHERE id=?', [productionId]))?.status, 'approved');
  assert.equal((await database.queryOne<{ status: string }>('SELECT status FROM topics WHERE id=?', [topicId]))?.status, 'shooting');
  assert.equal((await database.queryOne<{ status: string }>('SELECT status FROM shooting WHERE topic_id=?', [topicId]))?.status, 'planned');
  assert.equal(await historyCount(), 1, 'approval status changes must not create a content version');
  assert.equal(
    Number((await database.queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM topic_history WHERE topic_id=? AND action='production_status_changed'`, [topicId]))?.total || 0),
    2,
  );
  assert.equal((await save({
    version: 'v2.0',
    content: '正式新版本',
    expected_content: '正式新版本',
    status: 'approved',
    version_action: 'none',
  })).status, 200);
  assert.equal(
    Number((await database.queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM topic_history WHERE topic_id=? AND action='production_status_changed'`, [topicId]))?.total || 0),
    2,
    'saving the same status must not duplicate status history',
  );

  await database.execute(`CREATE TRIGGER block_production_version_history_test BEFORE INSERT ON production_history
    WHEN NEW.production_id=${productionId} BEGIN SELECT RAISE(ABORT, 'simulated production version history failure'); END`);
  const failedVersionSnapshot = await save({
    version: 'v2.0',
    content: '未提交的新大版本',
    expected_content: '正式新版本',
    status: 'approved',
    version_action: 'major',
  });
  assert.equal(failedVersionSnapshot.status, 500);
  assert.deepEqual(await current(), { version: 'v2.0', content: '正式新版本' }, 'failed history creation must rollback the current production write');
  assert.equal((await database.queryOne<{ status: string }>('SELECT status FROM production WHERE id=?', [productionId]))?.status, 'approved');
  assert.equal(await historyCount(), 1, 'failed version creation must not leave a partial history row');
  await database.execute('DROP TRIGGER block_production_version_history_test');

  await database.execute('DELETE FROM production_material_drafts WHERE production_id=?', [productionId]);
  const recoveredVersionSnapshot = await save({
    version: 'v2.0',
    content: '新大版本重试',
    expected_content: '正式新版本',
    status: 'approved',
    version_action: 'major',
  });
  assert.equal(recoveredVersionSnapshot.status, 200);
  assert.deepEqual(await current(), { version: 'v3.0', content: '新大版本重试' });
  assert.equal(await historyCount(), 2, 'a successful retry writes exactly one version snapshot');
  const v2Snapshot = await database.queryOne<{ material_draft_snapshot_html: string | null }>(
    'SELECT material_draft_snapshot_html FROM production_history WHERE production_id=? AND version=?',
    [productionId, 'v2.0'],
  );
  assert.equal(v2Snapshot?.material_draft_snapshot_html, '', 'a version without a draft records an intentional empty snapshot, not a legacy unknown');

  await database.execute(`CREATE TRIGGER block_production_history_cleanup_test BEFORE DELETE ON production_history
    WHEN OLD.production_id=${productionId} BEGIN SELECT RAISE(ABORT, 'simulated production history cleanup failure'); END`);
  const savedDespiteHistoryCleanupFailure = await save({
    version: 'v3.0',
    content: '保留清理失败后的新小版本',
    expected_content: '新大版本重试',
    status: 'approved',
    version_action: 'minor',
  });
  assert.equal(savedDespiteHistoryCleanupFailure.status, 200, 'retention cleanup failure must not misreport a committed production save');
  assert.deepEqual(await current(), { version: 'v3.1', content: '保留清理失败后的新小版本' });
  assert.equal(await database.queryOne('SELECT id FROM production_history WHERE production_id=? AND version=?', [productionId, 'v3.0']) !== null, true, 'failed cleanup safely leaves the prior snapshot available');
  await database.execute('DROP TRIGGER block_production_history_cleanup_test');
  console.log('production collaboration HTTP tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
