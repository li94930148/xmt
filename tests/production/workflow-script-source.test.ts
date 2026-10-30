import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { workflowScriptSourceTimestamp } from '../../src/utils/workflow-script-source';

const historyTimestamp = workflowScriptSourceTimestamp({
  version_timestamp: '2026-10-01 12:00:00',
  created_at: '2026-09-01 08:00:00',
});
assert.equal(historyTimestamp, new Date('2026-10-01T04:00:00.000Z').getTime(), 'timeline timestamp selection prefers the exact source-version time over its record creation time');
assert.equal(
  workflowScriptSourceTimestamp({ version_timestamp: null, created_at: '2026-09-01 08:00:00' }),
  new Date('2026-09-01T00:00:00.000Z').getTime(),
  'legacy source payloads fall back to the source record timestamp, never the derived stage timestamp',
);
assert.equal(workflowScriptSourceTimestamp({ version_timestamp: null, created_at: null }), null, 'missing source timestamps are not fabricated');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-workflow-script-source-'));
process.env.XMT_DB_PATH = path.join(directory, 'workflow.db');
process.env.JWT_SECRET = 'workflow-script-source-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { default: workflowRouter } = await import('../../api/routes/workflow.js');
const { syncPublishedArchive } = await import('../../api/services/publishedArchive.js');

await initDatabase();
const director = await queryOne<{ id: number }>("SELECT id FROM users WHERE username='director'");
assert(director);
await execute('UPDATE users SET force_change_password=0 WHERE id=?', [director.id]);

async function createTopic(title: string) {
  return executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,'shooting')`,
    [title, '', 'douyin', director.id, director.id],
  );
}

const topicId = await createTopic('稿件来源追溯隔离选题');
const historicalSourceContent = '<p>历史创作来源</p><p><a href="/asset-center/resources/9301">来源：历史采访资料</a></p>';
const sourceProductionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v2.0','<p>当前创作稿</p>','approved',?)`,
  [topicId, director.id],
);
const sourceHistoryId = await executeInsert(
  `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id)
   VALUES(?,'v1.0',?,'approved','major',?)`,
  [sourceProductionId, historicalSourceContent, director.id],
);
const historicalVersionTimestamp = '2026-10-01 12:00:00';
await execute('UPDATE production_history SET created_at=? WHERE id=?', [historicalVersionTimestamp, sourceHistoryId]);
await execute(
  `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id)
   VALUES(?,'v1.1','<p>较新的历史版本</p>','approved','minor',?)`,
  [sourceProductionId, director.id],
);
await execute(
  `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id)
   VALUES(?,'v1.2','<p>创作来源新版</p>','approved','minor',?)`,
  [sourceProductionId, director.id],
);
const shootingId = await executeInsert(
  `INSERT INTO shooting(topic_id,status,script_content,operator_id) VALUES(?,'in_progress',NULL,?)`,
  [topicId, director.id],
);
const publishingId = await executeInsert(
  `INSERT INTO publishing(topic_id,platform,status,script_content,operator_id) VALUES(?,'抖音','published',NULL,?)`,
  [topicId, director.id],
);
const otherTopicId = await createTopic('不能交叉引用的隔离选题');
const otherProductionId = await executeInsert(
  `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','<p>其他选题</p>','approved',?)`,
  [otherTopicId, director.id],
);
const invalidTopicId = await createTopic('无效来源写入隔离选题');
const invalidSourceShootingId = await executeInsert(
  `INSERT INTO shooting(topic_id,status,script_content,operator_id) VALUES(?,'planned',NULL,?)`,
  [invalidTopicId, director.id],
);
const legacyTopicId = await createTopic('旧剧本来源隔离选题');
const legacyShootingId = await executeInsert(
  `INSERT INTO shooting(topic_id,status,script_content,operator_id) VALUES(?,'in_progress','<p>历史独立稿</p>',?)`,
  [legacyTopicId, director.id],
);

const app = express();
app.use(express.json());
app.use('/api/workflow', workflowRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/workflow`;
const headers = {
  authorization: `Bearer ${signToken({ userId: director.id })}`,
  'content-type': 'application/json',
};

try {
  const sourcePayload = {
    script_content: '<p>隔离衍生剧本</p>',
    script_source_production_id: sourceProductionId,
    script_source_version: 'v1.0',
  };
  const fallbackDetail = await fetch(`${base}/shooting/${shootingId}`, { headers }).then((response) => response.json());
  assert.equal(fallbackDetail.production.version_timestamp, fallbackDetail.production.updated_at, 'the current approved manuscript exposes its latest confirmed update time');
  const shootingWrite = await fetch(`${base}/shooting/${shootingId}`, {
    method: 'PUT', headers, body: JSON.stringify(sourcePayload),
  });
  assert.equal(shootingWrite.status, 200, 'a shooting script can link to an approved historical version');
  assert.deepEqual(
    await queryOne('SELECT script_content,script_source_production_id,script_source_version FROM shooting WHERE id=?', [shootingId]),
    { script_content: '<p>隔离衍生剧本</p>', script_source_production_id: sourceProductionId, script_source_version: 'v1.0' },
  );
  assert.equal(Number((await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM workflow_document_versions WHERE document_type='shooting_script' AND document_id=?`, [String(shootingId)],
  ))?.total), 0, 'ordinary shooting saves do not create versions');
  const shootingVersion = await fetch(`${base}/shooting/${shootingId}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ ...sourcePayload, expected_content: '<p>隔离衍生剧本</p>', version_action: 'minor' }),
  });
  assert.equal(shootingVersion.status, 200, 'explicit shooting version actions create a saved version');
  let shootingVersions = await fetch(`${base}/shooting/${shootingId}/versions`, { headers }).then((response) => response.json());
  assert.deepEqual(shootingVersions.data.map((entry: { version: string }) => entry.version), ['baseline', 'v1.0']);
  assert.equal(shootingVersions.data[0].source_production_id, null, 'a legacy baseline does not inherit a source that was recorded later');
  assert.equal(shootingVersions.data[1].source_production_id, sourceProductionId);
  assert.equal(shootingVersions.data[1].source_production_version, 'v1.0', 'the explicit history row returns its own exact source');
  const nextShootingVersion = await fetch(`${base}/shooting/${shootingId}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ ...sourcePayload, script_content: '<p>成片剧本小修</p>', expected_content: '<p>隔离衍生剧本</p>', version_action: 'minor' }),
  });
  assert.equal(nextShootingVersion.status, 200);
  const staleShootingVersion = await fetch(`${base}/shooting/${shootingId}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ ...sourcePayload, script_content: '<p>过期成片稿</p>', expected_content: '<p>旧客户端稿件</p>', version_action: 'major' }),
  });
  assert.equal(staleShootingVersion.status, 409, 'a stale collaborator cannot create or replace a shooting version');
  shootingVersions = await fetch(`${base}/shooting/${shootingId}/versions`, { headers }).then((response) => response.json());
  assert.deepEqual(shootingVersions.data.map((entry: { version: string }) => entry.version), ['baseline', 'v1.1', 'v1.0']);
  await execute(
    `INSERT INTO workflow_document_versions (
      document_type,document_id,version,content,change_type,is_baseline,operator_id,
      source_production_id,source_production_version,created_at
    ) VALUES ('shooting_script',?,'v2.0','<p>旧来源分支的成片历史</p>','major',0,?,?,?,?)`,
    [String(shootingId), director.id, sourceProductionId, 'v1.1', historicalVersionTimestamp],
  );
  const shootingDetail = await fetch(`${base}/shooting/${shootingId}`, { headers }).then((response) => response.json());
  assert.equal(shootingDetail.script_source_production.version, 'v1.0');
  assert.equal(shootingDetail.script_source_production.content, historicalSourceContent, 'the linked historical snapshot, including its resource source URL, remains addressable after the current version advances');
  assert.equal(shootingDetail.script_source_production.version_timestamp, historicalVersionTimestamp, 'the linked history uses the exact snapshot timestamp');
  const laterShootingTimestamp = '2026-10-10 09:00:00';
  await execute('UPDATE shooting SET updated_at=? WHERE id=?', [laterShootingTimestamp, shootingId]);
  const shootingAfterEdit = await fetch(`${base}/shooting/${shootingId}`, { headers }).then((response) => response.json());
  assert.equal(shootingAfterEdit.updated_at, laterShootingTimestamp);
  assert.equal(shootingAfterEdit.script_source_production.version_timestamp, historicalVersionTimestamp, 'editing the derived shooting record cannot move the linked source version timestamp');
  const exactHistory = await fetch(`${base}/production/${sourceProductionId}/history?version=v1.0`, { headers }).then((response) => response.json());
  assert.equal(exactHistory.data[0].version, 'v1.0', 'a source deep link can request an older history entry outside the default condensed list');
  assert.equal(exactHistory.data[0].content, historicalSourceContent, 'the exact-version history response preserves the embedded resource ID and source label');

  const productionUpdate = await fetch(`${base}/production/${sourceProductionId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      topic_id: topicId,
      version: 'v2.0',
      content: '<p>新的当前创作稿</p>',
      status: 'approved',
      expected_content: '<p>当前创作稿</p>',
      version_action: 'minor',
    }),
  });
  assert.equal(productionUpdate.status, 200, 'the current production can advance while a prior source version is referenced');
  assert.equal((await productionUpdate.json()).version, 'v2.1');
  assert.equal(
    Number((await queryOne<{ id: number }>('SELECT id FROM production_history WHERE production_id=? AND version=?', [sourceProductionId, 'v1.0']))?.id),
    sourceHistoryId,
    'history cleanup preserves a referenced source version even when a newer minor exists in that major',
  );
  assert.ok(
    await queryOne('SELECT id FROM production_history WHERE production_id=? AND version=?', [sourceProductionId, 'v1.1']),
    'history cleanup preserves a source referenced only by a versioned shooting script, even after a newer source minor exists',
  );
  const retainedHistoricalSource = await fetch(`${base}/production/${sourceProductionId}/history?version=v1.1`, { headers }).then((response) => response.json());
  assert.equal(retainedHistoricalSource.data[0]?.version, 'v1.1', 'the history-only source remains available to the exact-version deep link');
  const deleteReferencedProduction = await fetch(`${base}/production/${sourceProductionId}`, { method: 'DELETE', headers });
  assert.equal(deleteReferencedProduction.status, 409, 'a production record referenced by stage scripts cannot be deleted');
  const historyOnlyTopicId = await createTopic('仅历史剧本版本引用的创作稿隔离选题');
  const historyOnlyProductionId = await executeInsert(
    `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','<p>仅历史引用</p>','approved',?)`,
    [historyOnlyTopicId, director.id],
  );
  const historyOnlyShootingId = await executeInsert(
    `INSERT INTO shooting(topic_id,status,script_content,operator_id) VALUES(?,'in_progress','<p>独立阶段稿</p>',?)`,
    [historyOnlyTopicId, director.id],
  );
  await execute(
    `INSERT INTO workflow_document_versions (
      document_type,document_id,version,content,change_type,is_baseline,operator_id,
      source_production_id,source_production_version,created_at
    ) VALUES ('shooting_script',?,'v1.0','<p>仍在历史中引用创作稿</p>','minor',0,?,?,?,?)`,
    [String(historyOnlyShootingId), director.id, historyOnlyProductionId, 'v1.0', historicalVersionTimestamp],
  );
  assert.equal(
    (await fetch(`${base}/production/${historyOnlyProductionId}`, { method: 'DELETE', headers })).status,
    409,
    'a production cannot be deleted while a historical derived-script version still links to it',
  );
  assert.ok(await queryOne('SELECT id FROM production WHERE id=?', [historyOnlyProductionId]), 'the historical source remains intact after the refused deletion');
  const deletionTopicId = await createTopic('删除审计隔离选题');
  const deletionProductionId = await executeInsert(
    `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v3.2','<p>待删除稿件</p>','approved',?)`,
    [deletionTopicId, director.id],
  );
  await execute(
    `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id)
     VALUES(?,'v3.1','<p>待删除历史</p>','approved','minor',?)`,
    [deletionProductionId, director.id],
  );
  await execute(
    `CREATE TRIGGER fail_production_delete_audit BEFORE INSERT ON activity_log
     WHEN NEW.action='delete' AND NEW.target='production'
     BEGIN SELECT RAISE(ABORT, 'injected production audit failure'); END`,
  );
  const failedDeleteAudit = await fetch(`${base}/production/${deletionProductionId}`, { method: 'DELETE', headers });
  assert.equal(failedDeleteAudit.status, 500, 'a failed deletion audit is returned as a failed delete');
  assert.ok(await queryOne('SELECT id FROM production WHERE id=?', [deletionProductionId]), 'a failed audit rolls the production deletion back');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_history WHERE production_id=?', [deletionProductionId],
  ))?.count || 0), 1, 'a failed audit also preserves the production history');
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='production_deleted'", [deletionTopicId],
  ))?.count || 0), 0, 'a failed activity audit rolls the topic history audit back');
  await execute('DROP TRIGGER fail_production_delete_audit');
  const auditedDelete = await fetch(`${base}/production/${deletionProductionId}`, { method: 'DELETE', headers });
  assert.equal(auditedDelete.status, 200, 'an unreferenced production can be deleted after the audit sink recovers');
  assert.equal(await queryOne('SELECT id FROM production WHERE id=?', [deletionProductionId]), null);
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_history WHERE production_id=?', [deletionProductionId],
  ))?.count || 0), 0, 'successful deletion removes the private production snapshots');
  const topicDeleteAudit = await queryOne<{ action: string; comment: string; operator_id: number }>(
    "SELECT action,comment,operator_id FROM topic_history WHERE topic_id=? AND action='production_deleted'",
    [deletionTopicId],
  );
  assert.equal(topicDeleteAudit?.action, 'production_deleted');
  assert.match(topicDeleteAudit?.comment || '', /创作记录 #\d+（v3\.2）.*清除 1 条创作历史版本/);
  assert.equal(topicDeleteAudit?.operator_id, director.id, 'the topic history keeps the deleting operator');
  const activityDeleteAudit = await queryOne<{ action: string; target: string; detail: string; user_id: number }>(
    "SELECT action,target,detail,user_id FROM activity_log WHERE target='production' AND action='delete' AND user_id=? ORDER BY id DESC LIMIT 1",
    [director.id],
  );
  assert.equal(activityDeleteAudit?.target, 'production');
  assert.match(activityDeleteAudit?.detail || '', /创作记录 #\d+（v3\.2）.*清除 1 条创作历史版本/);
  assert.equal(activityDeleteAudit?.user_id, director.id, 'the global activity log keeps the deleting operator');

  await execute("INSERT OR IGNORE INTO roles(code,name,description,is_system) VALUES('production-delete-scoped','创作删除范围测试角色','仅验证逐条编辑范围',0)");
  await execute(`
    INSERT OR IGNORE INTO role_permissions(role_id,permission_id)
    SELECT r.id,p.id FROM roles r,permissions p
    WHERE r.code='production-delete-scoped' AND p.code='production:delete'
  `);
  const scopedMemberId = await executeInsert(
    'INSERT INTO users(username,password,role,name,enabled) VALUES(?,?,?,?,1)',
    ['production-delete-scoped-member', 'unused', 'member', '范围删除测试成员'],
  );
  await execute('INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [scopedMemberId, 'production-delete-scoped']);
  await execute('UPDATE users SET force_change_password=0 WHERE id=?', [scopedMemberId]);
  clearPermissionCache(scopedMemberId);
  const scopedMemberHeaders = {
    authorization: `Bearer ${signToken({ userId: scopedMemberId, username: 'production-delete-scoped-member', role: 'member' })}`,
    'content-type': 'application/json',
  };
  const outsideScopeTopicId = await createTopic('范围外删除必须拒绝的选题');
  const outsideScopeProductionId = await executeInsert(
    `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','<p>范围外稿件</p>','approved',?)`,
    [outsideScopeTopicId, director.id],
  );
  await execute(
    `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id)
     VALUES(?,'v0.9','<p>范围外历史</p>','approved','minor',?)`,
    [outsideScopeProductionId, director.id],
  );
  const outOfScopeDelete = await fetch(`${base}/production/${outsideScopeProductionId}`, {
    method: 'DELETE', headers: scopedMemberHeaders,
  });
  assert.equal(outOfScopeDelete.status, 403, 'production:delete alone cannot bypass the per-topic edit scope');
  assert.ok(await queryOne('SELECT id FROM production WHERE id=?', [outsideScopeProductionId]), 'the out-of-scope production remains intact');
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_history WHERE production_id=?', [outsideScopeProductionId],
  ))?.count || 0), 1, 'the out-of-scope production history remains intact');
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM topic_history WHERE topic_id=? AND action='production_deleted'", [outsideScopeTopicId],
  ))?.count || 0), 0, 'a refused delete creates no topic-history audit');
  assert.equal(Number((await queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM activity_log WHERE target='production' AND action='delete' AND detail LIKE ?",
    [`%创作记录 #${outsideScopeProductionId}%`],
  ))?.count || 0), 0, 'a refused delete creates no activity audit');

  const inScopeTopicId = await executeInsert(
    `INSERT INTO topics(title,description,platform,creator_id,assignee_id,status) VALUES(?,?,?,?,?,'shooting')`,
    ['范围内删除仍允许的选题', '', 'douyin', scopedMemberId, scopedMemberId],
  );
  const inScopeProductionId = await executeInsert(
    `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','<p>范围内稿件</p>','approved',?)`,
    [inScopeTopicId, scopedMemberId],
  );
  await execute(
    `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id)
     VALUES(?,'v0.9','<p>范围内历史</p>','approved','minor',?)`,
    [inScopeProductionId, scopedMemberId],
  );
  const inScopeDelete = await fetch(`${base}/production/${inScopeProductionId}`, {
    method: 'DELETE', headers: scopedMemberHeaders,
  });
  assert.equal(inScopeDelete.status, 200, 'the same permission still allows deletion within the member’s edit scope');
  assert.equal(await queryOne('SELECT id FROM production WHERE id=?', [inScopeProductionId]), null);
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_history WHERE production_id=?', [inScopeProductionId],
  ))?.count || 0), 0, 'an in-scope delete clears its private history');
  const scopedDeleteAudit = await queryOne<{ operator_id: number }>(
    "SELECT operator_id FROM topic_history WHERE topic_id=? AND action='production_deleted'", [inScopeTopicId],
  );
  assert.equal(scopedDeleteAudit?.operator_id, scopedMemberId, 'the in-scope delete retains its member actor in the topic audit');
  const sourceAfterCleanup = await fetch(`${base}/shooting/${shootingId}`, { headers }).then((response) => response.json());
  assert.equal(sourceAfterCleanup.script_source_production.version, 'v1.0');
  assert.equal(sourceAfterCleanup.script_source_production.content, historicalSourceContent, 'the stage source still resolves the same resource-bearing version after cleanup');

  const publishingWrite = await fetch(`${base}/publishing/${publishingId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...sourcePayload, script_content: '' }),
  });
  assert.equal(publishingWrite.status, 200);
  assert.equal(Number((await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM workflow_document_versions WHERE document_type='publishing_script' AND document_id=?`, [String(publishingId)],
  ))?.total), 0, 'ordinary publishing saves do not create versions');
  const publishingVersion = await fetch(`${base}/publishing/${publishingId}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ ...sourcePayload, script_content: '', expected_content: '', version_action: 'minor' }),
  });
  assert.equal(publishingVersion.status, 200, 'explicit publishing version actions create a saved version');
  const publishingVersions = await fetch(`${base}/publishing/${publishingId}/versions`, { headers }).then((response) => response.json());
  assert.deepEqual(publishingVersions.data.map((entry: { version: string }) => entry.version), ['baseline', 'v1.0']);
  assert.equal(publishingVersions.data[1].source_production_id, sourceProductionId);
  assert.equal(publishingVersions.data[1].source_production_version, 'v1.0', 'publishing history returns its exact source link');
  const publishingDetail = await fetch(`${base}/publishing/${publishingId}`, { headers }).then((response) => response.json());
  assert.equal(publishingDetail.script_content, '', 'an intentionally blank derived script remains blank');
  assert.equal(publishingDetail.script_source_production.version, 'v1.0');
  assert.equal(publishingDetail.script_source_production.version_timestamp, historicalVersionTimestamp, 'publishing details use the same exact historical source timestamp');

  const crossTopicWrite = await fetch(`${base}/shooting/${invalidSourceShootingId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ script_content: '不应写入', script_source_production_id: otherProductionId, script_source_version: 'v1.0' }),
  });
  assert.equal(crossTopicWrite.status, 400, 'a source from another topic cannot be attached');
  assert.deepEqual(
    await queryOne('SELECT script_content,script_source_production_id,script_source_version FROM shooting WHERE id=?', [invalidSourceShootingId]),
    { script_content: null, script_source_production_id: null, script_source_version: null },
  );

  await execute(
    'UPDATE shooting SET script_content=?,script_source_production_id=?,script_source_version=? WHERE id=?',
    ['<p>隔离的异常旧数据</p>', otherProductionId, 'v1.0', invalidSourceShootingId],
  );
  const invalidStoredSource = await fetch(`${base}/shooting/${invalidSourceShootingId}`, { headers }).then((response) => response.json());
  assert.equal(invalidStoredSource.script_source_production, null, 'detail reads fail closed when stored lineage points to another topic');

  const legacyWrite = await fetch(`${base}/shooting/${legacyShootingId}`, {
    method: 'PUT', headers, body: JSON.stringify(sourcePayload),
  });
  assert.equal(legacyWrite.status, 409, 'legacy local scripts are not retrospectively assigned a guessed source');
  assert.deepEqual(
    await queryOne('SELECT script_content,script_source_production_id,script_source_version FROM shooting WHERE id=?', [legacyShootingId]),
    { script_content: '<p>历史独立稿</p>', script_source_production_id: null, script_source_version: null },
  );

  const changedSourceWrite = await fetch(`${base}/shooting/${shootingId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ script_content: '<p>继续编辑</p>', script_source_production_id: sourceProductionId, script_source_version: 'v2.0' }),
  });
  assert.equal(changedSourceWrite.status, 409, 'an established source reference cannot be silently changed');

  await syncPublishedArchive(topicId, director.id);
  const archive = await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [`archive/topic-${topicId}`]);
  assert(archive);
  const archivePayload = JSON.parse(archive.content);
  assert.deepEqual(archivePayload.script_sources, {
    shooting: { topic_id: topicId, production_id: sourceProductionId, version: 'v1.0', state: 'unavailable' },
    publishing: { topic_id: topicId, production_id: sourceProductionId, version: 'v1.0', state: 'unavailable' },
  }, 'archive fails closed for history without recorded source-topic provenance');
  assert.deepEqual(archivePayload.script_source_snapshots, [], 'a source with NULL topic provenance is never embedded in the archive');
  assert.equal((await queryOne<{ source_topic_id: number | null }>(
    'SELECT source_topic_id FROM production_history WHERE production_id=? AND version=?', [sourceProductionId, 'v1.0'],
  ))?.source_topic_id, null, 'archive sync does not backfill an inferred historical source topic');

  const archivePath = `archive/topic-${topicId}`;
  await execute(
    `CREATE TRIGGER fail_shooting_archive_refresh BEFORE UPDATE ON resources
     WHEN OLD.file_path='${archivePath}'
     BEGIN SELECT RAISE(FAIL, 'injected archive write failure'); END`,
  );
  const failedShootingArchiveEdit = await fetch(`${base}/shooting/${shootingId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...sourcePayload, script_content: '<p>归档暂未同步的成片修订</p>' }),
  });
  assert.equal(failedShootingArchiveEdit.status, 200, 'a secondary archive failure does not misreport the confirmed shooting write');
  assert.equal((await failedShootingArchiveEdit.json()).archiveSync, 'pending');
  assert.equal(
    (await queryOne<{ script_content: string }>('SELECT script_content FROM shooting WHERE id=?', [shootingId]))?.script_content,
    '<p>归档暂未同步的成片修订</p>',
    'the primary shooting script remains saved when archive refresh fails',
  );
  const shootingWithStaleArchive = await fetch(`${base}/shooting/${shootingId}`, { headers }).then((response) => response.json());
  assert.equal(shootingWithStaleArchive.published_archive_script_sync_pending, true, 'a later page load detects persisted script drift against the archive');
  assert.equal(shootingWithStaleArchive.can_sync_published_archive, true, 'the retry action is only advertised to users in the existing editable workflow scope');
  const failedShootingRetry = await fetch(`${base}/shooting/${shootingId}/archive-sync`, { method: 'POST', headers });
  assert.equal(failedShootingRetry.status, 503, 'archive retry keeps a visible failure result when its write still fails');
  assert.equal((await failedShootingRetry.json()).archiveSync, 'pending');
  await execute('DROP TRIGGER fail_shooting_archive_refresh');
  const shootingRetry = await fetch(`${base}/shooting/${shootingId}/archive-sync`, { method: 'POST', headers });
  assert.equal(shootingRetry.status, 200, 'archive retry can recover without resubmitting the primary script write');
  assert.equal((await shootingRetry.json()).archiveSync, 'synced');
  const shootingArchiveAfterRetry = await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [archivePath]);
  assert(shootingArchiveAfterRetry);
  assert.equal(JSON.parse(shootingArchiveAfterRetry.content).shooting.script_content, '<p>归档暂未同步的成片修订</p>');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM shooting WHERE topic_id=?', [topicId]))?.count), 1, 'archive retry does not create another shooting record');
  assert.equal(
    (await fetch(`${base}/shooting/${shootingId}`, { headers }).then((response) => response.json())).published_archive_script_sync_pending,
    false,
    'the stale indicator clears after a confirmed retry',
  );

  const shootingEdit = await fetch(`${base}/shooting/${shootingId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...sourcePayload, script_content: '<p>归档后的成片修订</p>' }),
  });
  assert.equal(shootingEdit.status, 200);
  const shootingArchive = await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [`archive/topic-${topicId}`]);
  assert(shootingArchive);
  const shootingArchivePayload = JSON.parse(shootingArchive.content);
  assert.equal(shootingArchivePayload.shooting.script_content, '<p>归档后的成片修订</p>');
  assert.deepEqual(shootingArchivePayload.script_sources.shooting, {
    topic_id: topicId, production_id: sourceProductionId, version: 'v1.0', state: 'unavailable',
  }, 'a confirmed shooting edit preserves unavailable state for history with NULL source topic');
  assert.deepEqual(shootingArchivePayload.script_source_snapshots, [], 'a stage edit cannot make NULL-provenance source text available');

  await execute(
    `CREATE TRIGGER fail_publishing_archive_refresh BEFORE UPDATE ON resources
     WHEN OLD.file_path='${archivePath}'
     BEGIN SELECT RAISE(FAIL, 'injected archive write failure'); END`,
  );
  const failedPublishingArchiveEdit = await fetch(`${base}/publishing/${publishingId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...sourcePayload, script_content: '<p>归档暂未同步的发布修订</p>' }),
  });
  assert.equal(failedPublishingArchiveEdit.status, 200, 'a secondary archive failure does not misreport the confirmed publishing write');
  assert.equal((await failedPublishingArchiveEdit.json()).archiveSync, 'pending');
  assert.equal(
    (await queryOne<{ script_content: string }>('SELECT script_content FROM publishing WHERE id=?', [publishingId]))?.script_content,
    '<p>归档暂未同步的发布修订</p>',
    'the primary publishing script remains saved when archive refresh fails',
  );
  const publishingWithStaleArchive = await fetch(`${base}/publishing/${publishingId}`, { headers }).then((response) => response.json());
  assert.equal(publishingWithStaleArchive.published_archive_script_sync_pending, true, 'publishing details detect archive drift after reloading');
  assert.equal(publishingWithStaleArchive.can_sync_published_archive, true, 'publishing archive retry follows the existing publishing permission scope');
  const failedPublishingRetry = await fetch(`${base}/publishing/${publishingId}/archive-sync`, { method: 'POST', headers });
  assert.equal(failedPublishingRetry.status, 503, 'publishing archive retry exposes a recoverable failure');
  await execute('DROP TRIGGER fail_publishing_archive_refresh');
  const publishingRetry = await fetch(`${base}/publishing/${publishingId}/archive-sync`, { method: 'POST', headers });
  assert.equal(publishingRetry.status, 200, 'publishing archive retry succeeds independently of the primary update');
  assert.equal((await publishingRetry.json()).archiveSync, 'synced');
  const publishingArchiveAfterRetry = await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [archivePath]);
  assert(publishingArchiveAfterRetry);
  assert.equal(JSON.parse(publishingArchiveAfterRetry.content).publishing.script_content, '<p>归档暂未同步的发布修订</p>');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM publishing WHERE topic_id=?', [topicId]))?.count), 1, 'archive retry does not create another publishing record');
  assert.equal(
    (await fetch(`${base}/publishing/${publishingId}`, { headers }).then((response) => response.json())).published_archive_script_sync_pending,
    false,
    'publishing stale indication clears only after a successful archive retry',
  );

  const publishingEdit = await fetch(`${base}/publishing/${publishingId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...sourcePayload, script_content: '<p>归档后的发布修订</p>' }),
  });
  assert.equal(publishingEdit.status, 200);
  const publishingArchive = await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [`archive/topic-${topicId}`]);
  assert(publishingArchive);
  const publishingArchivePayload = JSON.parse(publishingArchive.content);
  assert.equal(publishingArchivePayload.publishing.script_content, '<p>归档后的发布修订</p>');
  assert.deepEqual(publishingArchivePayload.script_sources.publishing, {
    topic_id: topicId, production_id: sourceProductionId, version: 'v1.0', state: 'unavailable',
  }, 'a confirmed publishing edit preserves unavailable state for history with NULL source topic');
  assert.deepEqual(publishingArchivePayload.script_source_snapshots, []);

  const versionedPublishingEdit = await fetch(`${base}/publishing/${publishingId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      script_content: '<p>归档中的显式发布小版本</p>',
      expected_content: '<p>归档后的发布修订</p>',
      version_action: 'minor',
    }),
  });
  assert.equal(versionedPublishingEdit.status, 200, 'an explicit publishing version updates the canonical script and archive independently');
  assert.equal((await versionedPublishingEdit.json()).archiveSync, 'synced', 'the published archive is refreshed after an explicit script version action');
  const versionedPublishingArchive = await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [`archive/topic-${topicId}`]);
  assert(versionedPublishingArchive);
  assert.equal(JSON.parse(versionedPublishingArchive.content).publishing.script_content, '<p>归档中的显式发布小版本</p>');
  assert.equal(
    (await fetch(`${base}/publishing/${publishingId}`, { headers }).then((response) => response.json())).published_archive_script_sync_pending,
    false,
    'explicit version and archive content remain aligned after the confirmed write',
  );
  const versionedPublishingHistory = await fetch(`${base}/publishing/${publishingId}/versions`, { headers }).then((response) => response.json());
  assert(versionedPublishingHistory.data.some((entry: { version: string }) => entry.version === 'v1.1'), 'the archived canonical publishing script has an explicit matching version history entry');

  const multiRecordArchiveTopicId = await createTopic('多条发布记录保留各自来源的隔离选题');
  const multiRecordSourceId = await executeInsert(
    `INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v2.0','<p>归档精确来源 v2.0</p>','approved',?)`,
    [multiRecordArchiveTopicId, director.id],
  );
  await execute(
    `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id,source_topic_id)
     VALUES(?,'v1.0','<p>归档精确来源 v1.0</p>','approved','major',?,?)`,
    [multiRecordSourceId, director.id, multiRecordArchiveTopicId],
  );
  const firstPublishedRecordId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id,script_content,script_source_production_id,script_source_version)
     VALUES(?,'微信视频号','published','2026-10-28 10:00:00',?,'<p>微信发布稿</p>',?,'v1.0')`,
    [multiRecordArchiveTopicId, director.id, multiRecordSourceId],
  );
  const secondPublishedRecordId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id,script_content,script_source_production_id,script_source_version)
     VALUES(?,'抖音','published','2026-10-27 10:00:00',?,'<p>抖音发布稿</p>',?,'v2.0')`,
    [multiRecordArchiveTopicId, director.id, multiRecordSourceId],
  );
  const crossTopicPublishedRecordId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id,script_content,script_source_production_id,script_source_version)
     VALUES(?,'小红书','published','2026-10-26 10:00:00',?,'<p>异常来源发布稿</p>',?,'v1.0')`,
    [multiRecordArchiveTopicId, director.id, otherProductionId],
  );
  await syncPublishedArchive(multiRecordArchiveTopicId, director.id);
  const multiRecordArchive = await queryOne<{ content: string }>(
    'SELECT content FROM resources WHERE file_path=?',
    [`archive/topic-${multiRecordArchiveTopicId}`],
  );
  assert(multiRecordArchive);
  const multiRecordArchivePayload = JSON.parse(multiRecordArchive.content);
  const archivedPublicationById = new Map(
    multiRecordArchivePayload.published_records.map((record: { publishing_id: number }) => [record.publishing_id, record]),
  );
  assert.deepEqual(archivedPublicationById.get(firstPublishedRecordId)?.script_source, {
    topic_id: multiRecordArchiveTopicId, production_id: multiRecordSourceId, version: 'v1.0', state: 'derived',
  }, 'each published record archives the exact historical production version it referenced');
  assert.deepEqual(archivedPublicationById.get(secondPublishedRecordId)?.script_source, {
    topic_id: multiRecordArchiveTopicId, production_id: multiRecordSourceId, version: 'v2.0', state: 'derived',
  }, 'a second platform record keeps its independent current-version source');
  assert.deepEqual(archivedPublicationById.get(crossTopicPublishedRecordId)?.script_source, {
    topic_id: multiRecordArchiveTopicId,
    production_id: otherProductionId,
    version: 'v1.0',
    state: 'derived',
    source_topic_id: otherTopicId,
  }, 'a cross-topic source keeps its exact provenance pointer without embedding source text');
  assert.deepEqual(
    multiRecordArchivePayload.script_source_snapshots
      .map((snapshot: { version: string; content: string }) => [snapshot.version, snapshot.content])
      .sort(([leftVersion]: string[], [rightVersion]: string[]) => leftVersion.localeCompare(rightVersion)),
    [['v1.0', '<p>归档精确来源 v1.0</p>'], ['v2.0', '<p>归档精确来源 v2.0</p>']],
    'the archive stores same-topic source text once and excludes cross-topic source body',
  );
  const freshArchiveStatus = await fetch(`${base}/publishing/${firstPublishedRecordId}`, { headers }).then((response) => response.json());
  assert.equal(freshArchiveStatus.published_archive_script_sync_pending, false, 'a newly written archive with every per-record source is current');

  const withoutPerRecordSource = (record: Record<string, unknown>) => {
    const legacyRecord = { ...record };
    delete legacyRecord.script_source;
    return legacyRecord;
  };
  const legacyArchivePayload = {
    ...multiRecordArchivePayload,
    publishing: withoutPerRecordSource(multiRecordArchivePayload.publishing),
    published_records: multiRecordArchivePayload.published_records.map(withoutPerRecordSource),
  };
  const legacyArchiveContent = JSON.stringify(legacyArchivePayload);
  const multiRecordArchivePath = `archive/topic-${multiRecordArchiveTopicId}`;
  await execute('UPDATE resources SET content=? WHERE file_path=?', [legacyArchiveContent, multiRecordArchivePath]);
  const legacyArchiveStatus = await fetch(`${base}/publishing/${firstPublishedRecordId}`, { headers }).then((response) => response.json());
  assert.equal(legacyArchiveStatus.published_archive_script_sync_pending, true, 'an archive with missing per-record source objects exposes the existing manual retry state');
  assert.equal(legacyArchiveStatus.can_sync_published_archive, true, 'the existing manual retry remains available in the current editable scope');
  assert.equal(
    (await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [multiRecordArchivePath]))?.content,
    legacyArchiveContent,
    'reading drift status does not rewrite the legacy archive automatically',
  );

  const explicitArchiveSync = await fetch(`${base}/publishing/${firstPublishedRecordId}/archive-sync`, { method: 'POST', headers });
  assert.equal(explicitArchiveSync.status, 200, 'the existing explicit archive-sync action rebuilds a legacy archive');
  assert.equal((await explicitArchiveSync.json()).archiveSync, 'synced');
  const refreshedMultiRecordArchive = await queryOne<{ content: string }>(
    'SELECT content FROM resources WHERE file_path=?',
    [multiRecordArchivePath],
  );
  assert(refreshedMultiRecordArchive);
  const refreshedMultiRecordPayload = JSON.parse(refreshedMultiRecordArchive.content);
  const refreshedPublicationById = new Map(
    refreshedMultiRecordPayload.published_records.map((record: { publishing_id: number }) => [record.publishing_id, record]),
  );
  assert.deepEqual(refreshedPublicationById.get(firstPublishedRecordId)?.script_source, {
    topic_id: multiRecordArchiveTopicId, production_id: multiRecordSourceId, version: 'v1.0', state: 'derived',
  }, 'manual refresh restores the first record’s exact source version');
  assert.deepEqual(refreshedPublicationById.get(secondPublishedRecordId)?.script_source, {
    topic_id: multiRecordArchiveTopicId, production_id: multiRecordSourceId, version: 'v2.0', state: 'derived',
  }, 'manual refresh restores each other record’s independent exact source version');
  assert.equal(
    (await fetch(`${base}/publishing/${firstPublishedRecordId}`, { headers }).then((response) => response.json())).published_archive_script_sync_pending,
    false,
    'a refreshed archive no longer reports per-record source drift',
  );

  const missingPublishedRecordPayload = {
    ...refreshedMultiRecordPayload,
    published_records: refreshedMultiRecordPayload.published_records.slice(0, 2),
  };
  const missingPublishedRecordContent = JSON.stringify(missingPublishedRecordPayload);
  await execute('UPDATE resources SET content=? WHERE file_path=?', [missingPublishedRecordContent, multiRecordArchivePath]);
  const missingRecordStatus = await fetch(`${base}/publishing/${firstPublishedRecordId}`, { headers }).then((response) => response.json());
  assert.equal(missingRecordStatus.published_archive_script_sync_pending, true, 'an archive whose published-record count no longer matches current records exposes the manual retry state');
  assert.equal(
    (await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [multiRecordArchivePath]))?.content,
    missingPublishedRecordContent,
    'a published-record count mismatch is detected without automatic archive rewriting',
  );
  const missingRecordSync = await fetch(`${base}/publishing/${firstPublishedRecordId}/archive-sync`, { method: 'POST', headers });
  assert.equal(missingRecordSync.status, 200);
  assert.equal((await missingRecordSync.json()).archiveSync, 'synced');
  const countRestoredStatus = await fetch(`${base}/publishing/${firstPublishedRecordId}`, { headers }).then((response) => response.json());
  assert.equal(countRestoredStatus.published_archive_script_sync_pending, false, 'the explicit retry restores the full published-record count');

  const accurateAfterCountRestore = await queryOne<{ content: string }>(
    'SELECT content FROM resources WHERE file_path=?',
    [multiRecordArchivePath],
  );
  assert(accurateAfterCountRestore);
  const misattributedSourcePayload = JSON.parse(accurateAfterCountRestore.content);
  const misattributedArchivePayload = {
    ...misattributedSourcePayload,
    published_records: misattributedSourcePayload.published_records.map((record: Record<string, unknown>) => Number(record.publishing_id) === firstPublishedRecordId
      ? { ...record, script_source: { ...record.script_source as Record<string, unknown>, version: 'v2.0' } }
      : record),
  };
  const misattributedArchiveContent = JSON.stringify(misattributedArchivePayload);
  await execute('UPDATE resources SET content=? WHERE file_path=?', [misattributedArchiveContent, multiRecordArchivePath]);
  const misattributedSourceStatus = await fetch(`${base}/publishing/${firstPublishedRecordId}`, { headers }).then((response) => response.json());
  assert.equal(misattributedSourceStatus.published_archive_script_sync_pending, true, 'a structurally valid but mismatched per-record source version is detected as drift');
  assert.equal(
    (await queryOne<{ content: string }>('SELECT content FROM resources WHERE file_path=?', [multiRecordArchivePath]))?.content,
    misattributedArchiveContent,
    'checking a mismatched source does not rewrite the archive automatically',
  );
  const exactSourceRetry = await fetch(`${base}/publishing/${firstPublishedRecordId}/archive-sync`, { method: 'POST', headers });
  assert.equal(exactSourceRetry.status, 200);
  assert.equal((await exactSourceRetry.json()).archiveSync, 'synced');
  const exactSourceAfterRetry = await queryOne<{ content: string }>(
    'SELECT content FROM resources WHERE file_path=?',
    [multiRecordArchivePath],
  );
  assert(exactSourceAfterRetry);
  const exactSourceAfterRetryPayload = JSON.parse(exactSourceAfterRetry.content);
  const exactSourceById = new Map(
    exactSourceAfterRetryPayload.published_records.map((record: { publishing_id: number }) => [record.publishing_id, record]),
  );
  assert.deepEqual(exactSourceById.get(firstPublishedRecordId)?.script_source, {
    topic_id: multiRecordArchiveTopicId, production_id: multiRecordSourceId, version: 'v1.0', state: 'derived',
  }, 'explicit retry restores the first record source from its own stored pointer');
  assert.equal(
    (await fetch(`${base}/publishing/${firstPublishedRecordId}`, { headers }).then((response) => response.json())).published_archive_script_sync_pending,
    false,
    'the exact source relationship is current after explicit archive synchronization',
  );

  const originalProductionTopicId = await createTopic('重关联稿件的历史来源选题');
  const reassignedProductionTopicId = await createTopic('重关联稿件的新选题');
  const reassignedProductionId = await executeInsert(
    `INSERT INTO production(topic_id,version,content,status,operator_id)
     VALUES(?,'v1.0','<p>仍属于原选题的 v1.0 正文</p>','approved',?)`,
    [originalProductionTopicId, director.id],
  );
  const originalTopicPublishingId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id,script_content,script_source_production_id,script_source_version)
     VALUES(?,'抖音','published','2026-10-28 10:00:00',?,NULL,?,'v1.0')`,
    [originalProductionTopicId, director.id, reassignedProductionId],
  );
  const originalTopicShootingId = await executeInsert(
    `INSERT INTO shooting(topic_id,status,operator_id,script_content,script_source_production_id,script_source_version)
     VALUES(?,'in_progress',?,NULL,?,'v1.0')`,
    [originalProductionTopicId, director.id, reassignedProductionId],
  );
  const reassignment = await fetch(`${base}/production/${reassignedProductionId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      topic_id: reassignedProductionTopicId,
      version: 'v1.0',
      content: '<p>新选题的 v1.1 正文</p>',
      status: 'approved',
      expected_content: '<p>仍属于原选题的 v1.0 正文</p>',
      version_action: 'minor',
    }),
  });
  assert.equal(reassignment.status, 200, 'the existing production topic-reassignment contract remains available with an explicit new version');
  const reassignedProduction = await queryOne<{
    topic_id: number;
    version: string;
    content: string;
  }>('SELECT topic_id,version,content FROM production WHERE id=?', [reassignedProductionId]);
  assert.deepEqual(reassignedProduction, {
    topic_id: reassignedProductionTopicId,
    version: 'v1.1',
    content: '<p>新选题的 v1.1 正文</p>',
  });
  assert.equal((await queryOne<{ source_topic_id: number | null }>(
    'SELECT source_topic_id FROM production_history WHERE production_id=? AND version=?',
    [reassignedProductionId, 'v1.0'],
  ))?.source_topic_id, originalProductionTopicId, 'the superseded source version records the topic that owned it before reassignment');

  const originalTopicShooting = await fetch(`${base}/shooting/${originalTopicShootingId}`, { headers }).then((response) => response.json());
  const originalTopicPublishing = await fetch(`${base}/publishing/${originalTopicPublishingId}`, { headers }).then((response) => response.json());
  assert.equal(originalTopicShooting.script_source_production.version, 'v1.0');
  assert.equal(originalTopicShooting.script_source_production.content, '<p>仍属于原选题的 v1.0 正文</p>', 'the original topic can still read its explicitly attributed historical version');
  assert.equal(originalTopicPublishing.script_source_production.version, 'v1.0');
  assert.equal(originalTopicPublishing.script_source_production.content, '<p>仍属于原选题的 v1.0 正文</p>');

  const newTopicPublishingId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id,script_content,script_source_production_id,script_source_version)
     VALUES(?,'微信视频号','published','2026-10-29 10:00:00',?,NULL,?,'v1.1')`,
    [reassignedProductionTopicId, director.id, reassignedProductionId],
  );
  const newTopicPublishing = await fetch(`${base}/publishing/${newTopicPublishingId}`, { headers }).then((response) => response.json());
  assert.equal(newTopicPublishing.script_source_production.version, 'v1.1');
  assert.equal(newTopicPublishing.script_source_production.content, '<p>新选题的 v1.1 正文</p>', 'the new topic resolves only the current version it owns');

  await syncPublishedArchive(originalProductionTopicId, director.id);
  await syncPublishedArchive(reassignedProductionTopicId, director.id);
  const originalTopicArchive = await queryOne<{ content: string }>(
    'SELECT content FROM resources WHERE file_path=?', [`archive/topic-${originalProductionTopicId}`],
  );
  const reassignedTopicArchive = await queryOne<{ content: string }>(
    'SELECT content FROM resources WHERE file_path=?', [`archive/topic-${reassignedProductionTopicId}`],
  );
  assert(originalTopicArchive && reassignedTopicArchive);
  const originalTopicArchivePayload = JSON.parse(originalTopicArchive.content);
  const reassignedTopicArchivePayload = JSON.parse(reassignedTopicArchive.content);
  assert.equal(originalTopicArchivePayload.published_records[0].script_source.state, 'derived');
  assert.equal(originalTopicArchivePayload.script_source_snapshots[0].content, '<p>仍属于原选题的 v1.0 正文</p>');
  assert.equal(reassignedTopicArchivePayload.published_records[0].script_source.state, 'derived');
  assert.equal(reassignedTopicArchivePayload.script_source_snapshots[0].content, '<p>新选题的 v1.1 正文</p>');

  const legacyOriginalTopicId = await createTopic('缺少历史 topic 来源字段的旧选题');
  const legacyCurrentTopicId = await createTopic('缺少历史 topic 来源字段后的新选题');
  const legacyProductionId = await executeInsert(
    `INSERT INTO production(topic_id,version,content,status,operator_id)
     VALUES(?,'v1.0','<p>旧版当前稿</p>','approved',?)`,
    [legacyOriginalTopicId, director.id],
  );
  await execute(
    `INSERT INTO production_history(production_id,version,content,status,change_type,operator_id)
     VALUES(?,'v0.9','<p>没有可验证归属的旧历史</p>','approved','minor',?)`,
    [legacyProductionId, director.id],
  );
  const legacyTopicPublishingId = await executeInsert(
    `INSERT INTO publishing(topic_id,platform,status,publish_time,operator_id,script_content,script_source_production_id,script_source_version)
     VALUES(?,'抖音','published','2026-10-28 11:00:00',?,NULL,?,'v0.9')`,
    [legacyOriginalTopicId, director.id, legacyProductionId],
  );
  const legacyReassignment = await fetch(`${base}/production/${legacyProductionId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      topic_id: legacyCurrentTopicId,
      version: 'v1.0',
      content: '<p>重关联后的当前稿</p>',
      status: 'approved',
      expected_content: '<p>旧版当前稿</p>',
      version_action: 'minor',
    }),
  });
  assert.equal(legacyReassignment.status, 200);
  const legacyTopicPublishing = await fetch(`${base}/publishing/${legacyTopicPublishingId}`, { headers }).then((response) => response.json());
  assert.equal(legacyTopicPublishing.script_source_production, null, 'a legacy version without source_topic_id is not reattributed after its production moves');
  await syncPublishedArchive(legacyOriginalTopicId, director.id);
  const legacyTopicArchive = await queryOne<{ content: string }>(
    'SELECT content FROM resources WHERE file_path=?', [`archive/topic-${legacyOriginalTopicId}`],
  );
  assert(legacyTopicArchive);
  const legacyTopicArchivePayload = JSON.parse(legacyTopicArchive.content);
  assert.deepEqual(legacyTopicArchivePayload.published_records[0].script_source, {
    topic_id: legacyOriginalTopicId,
    production_id: legacyProductionId,
    version: 'v0.9',
    state: 'unavailable',
  }, 'archive rebuild retains the explicit reference as unavailable when its legacy history has no topic provenance');
  assert.equal(legacyTopicArchivePayload.script_source_snapshots.length, 0, 'archive rebuild does not infer body content from current or unassigned history');
  console.log('Workflow script source integration test passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
