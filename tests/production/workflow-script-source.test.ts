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
    shooting: { topic_id: topicId, production_id: sourceProductionId, version: 'v1.0', state: 'derived' },
    publishing: { topic_id: topicId, production_id: sourceProductionId, version: 'v1.0', state: 'derived' },
  }, 'published archive records explicit, reverse-queryable stage-to-production lineage');
  assert.deepEqual(archivePayload.script_source_snapshots, [{
    topic_id: topicId,
    production_id: sourceProductionId,
    version: 'v1.0',
    content: historicalSourceContent,
    content_markdown: null,
  }], 'the archive retains the exact approved source text once even when both stages share it');

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
    topic_id: topicId, production_id: sourceProductionId, version: 'v1.0', state: 'derived',
  }, 'a confirmed shooting edit refreshes the archive without drifting its source version');
  assert.equal(shootingArchivePayload.script_source_snapshots[0]?.content, historicalSourceContent, 'source resource identity remains in the archived historical version after a derived-script edit');

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
    topic_id: topicId, production_id: sourceProductionId, version: 'v1.0', state: 'derived',
  }, 'a confirmed publishing edit refreshes the archive without drifting its source version');
  assert.equal(publishingArchivePayload.script_source_snapshots[0]?.content, historicalSourceContent);

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
  console.log('Workflow script source integration test passed.');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}
