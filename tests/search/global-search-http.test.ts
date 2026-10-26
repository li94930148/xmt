import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-global-search-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'global-search.test.db');
process.env.JWT_SECRET = 'global-search-test-secret';

const [{ initDatabase, closeDatabase }, database, { signToken }, { default: workflowRouter }, { default: dailyReportsRouter }, { default: resourceCenterRouter }, { default: retrospectivesRouter }] = await Promise.all([
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
  import('../../api/routes/workflow.js'),
  import('../../api/routes/daily-reports.js'),
  import('../../api/routes/resource-center.js'),
  import('../../api/routes/retrospectives.js'),
]);

await initDatabase();
const userId = await database.executeInsert("INSERT INTO users(username,password,role,name,enabled) VALUES('global_search_user','unused','analyst','搜索成员',1)");
const coworkerId = await database.executeInsert("INSERT INTO users(username,password,role,name,enabled) VALUES('global_search_coworker','unused','analyst','其他成员',1)");
const roleId = await database.executeInsert("INSERT INTO roles(code,name,is_system) VALUES('global_search_test','全局搜索测试角色',1)");
for (const code of ['report:daily:submit', 'resource:view', 'analytics:retro:view', 'production:view']) {
  await database.execute(`INSERT INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE code=?`, [roleId, code]);
}
await database.execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', [userId, roleId]);

const ownTopicId = await database.executeInsert("INSERT INTO topics(title,status,creator_id,assignee_id) VALUES('搜索可见选题','production',?,?)", [userId, userId]);
const otherTopicId = await database.executeInsert("INSERT INTO topics(title,status,creator_id,assignee_id) VALUES('他人私有选题','production',?,?)", [coworkerId, coworkerId]);
const ownProductionId = await database.executeInsert("INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v2.1','manuscript-needle full body','draft',?)", [ownTopicId, userId]);
await database.execute("INSERT INTO production(topic_id,version,content,status,operator_id) VALUES(?,'v1.0','manuscript-needle private body','draft',?)", [otherTopicId, coworkerId]);

const ownReportId = await database.executeInsert("INSERT INTO daily_reports(user_id,report_date,status,manual_summary_md) VALUES(?,'2099-01-02','submitted','daily summary')", [userId]);
const otherReportId = await database.executeInsert("INSERT INTO daily_reports(user_id,report_date,status,manual_summary_md) VALUES(?,'2099-01-02','submitted','daily summary')", [coworkerId]);
await database.execute("INSERT INTO daily_report_items(report_id,section_key,title,content_md,sort_order) VALUES(?,'today','今日完成','daily-report-needle in report body',0)", [ownReportId]);
await database.execute("INSERT INTO daily_report_items(report_id,section_key,title,content_md,sort_order) VALUES(?,'today','今日完成','daily-report-needle coworker private',0)", [otherReportId]);

const ownResourceId = await database.executeInsert(
  `INSERT INTO resources(name,title,summary,library_type,visibility,status,content_text,source_type,owner_id,uploader_id,created_by,updated_by)
   VALUES('全局搜索资料','本地检索资料','资料摘要','knowledge','private','published','resource-needle phrase','manual',?,?,?,?)`,
  [userId, userId, userId, userId],
);
const searchCategoryId = await database.executeInsert(
  `INSERT INTO resource_categories(library_type,name,path,sort_order,enabled,created_by)
   VALUES('knowledge','搜索验收分类','/搜索验收分类',0,1,?)`,
  [userId],
);
const searchTagId = await database.executeInsert(
  `INSERT INTO resource_tags(name,normalized_name,created_by) VALUES('内容 规划','内容 规划',?)`,
  [userId],
);
await database.execute('UPDATE resources SET category_id=? WHERE id=?', [searchCategoryId, ownResourceId]);
await database.execute('INSERT INTO resource_tag_relations(resource_id,tag_id,created_by) VALUES(?,?,?)', [ownResourceId, searchTagId, userId]);
const otherOwnResourceId = await database.executeInsert(
  `INSERT INTO resources(name,title,summary,library_type,visibility,status,content_text,source_type,owner_id,uploader_id,created_by,updated_by)
   VALUES('全局搜索第二资料','A资料检索','第二条摘要','media','private','published','resource-needle phrase','manual',?,?,?,?)`,
  [userId, userId, userId, userId],
);
await database.execute("UPDATE resources SET updated_at='2099-01-01 00:00:00' WHERE id=?", [ownResourceId]);
await database.execute("UPDATE resources SET updated_at='2020-01-01 00:00:00' WHERE id=?", [otherOwnResourceId]);
await database.execute(
  `INSERT INTO resources(name,title,summary,library_type,visibility,status,content_text,source_type,owner_id,uploader_id,created_by,updated_by)
   VALUES('他人私有搜索资料','他人私有资料','不可见','knowledge','private','published','resource-needle phrase','manual',?,?,?,?)`,
  [coworkerId, coworkerId, coworkerId, coworkerId],
);

const ownRetroId = await database.executeInsert(
  "INSERT INTO retrospectives(title,scope_type,period_start,period_end,status,summary_md,owner_id,created_by) VALUES('季度复盘搜索','team','2099-01-01','2099-01-31','draft','retro-summary-needle',?,?)",
  [userId, userId],
);
await database.execute("INSERT INTO retro_actions(retro_id,title,description_md,owner_id,status,created_by) VALUES(?,'改进项','retro-action-needle',?,'todo',?)", [ownRetroId, userId, userId]);

const app = express();
app.use(express.json());
app.use('/api/workflow', workflowRouter);
app.use('/api/daily-reports', dailyReportsRouter);
app.use('/api/resource-center', resourceCenterRouter);
app.use('/api/retrospectives', retrospectivesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api`;
const token = signToken({ userId });
const headers = { Authorization: `Bearer ${token}` };

try {
  const productionResponse = await fetch(`${base}/workflow/production?search=manuscript-needle`, { headers });
  assert.equal(productionResponse.status, 200);
  const productions = await productionResponse.json() as { data: Array<Record<string, unknown>> };
  assert.deepEqual(productions.data.map((row) => Number(row.id)), [Number(ownProductionId)], 'full manuscript search retains the current topic-visibility scope');
  assert.equal('content' in productions.data[0], false, 'search returns minimal result fields rather than the manuscript body');
  assert.equal((await fetch(`${base}/workflow/production?search=x`, { headers })).status, 400, 'short manuscript terms are rejected');

  const dailyResponse = await fetch(`${base}/daily-reports/search?keyword=daily-report-needle`, { headers });
  assert.equal(dailyResponse.status, 200);
  const daily = await dailyResponse.json() as { data: { reports: Array<{ id: number; userId: number }> } };
  assert.deepEqual(daily.data.reports.map((row) => Number(row.id)), [Number(ownReportId)], 'daily full-text search is self-scoped without archive permission');
  assert.equal(Number(daily.data.reports[0].userId), Number(userId), 'daily result carries the authorized user ID for a precise archive link');
  const ownArchive = await fetch(`${base}/daily-reports/archive?start=2099-01-02&end=2099-01-02`, { headers });
  assert.equal(ownArchive.status, 200, 'daily submit permission can open the user-scoped archive destination');
  const archive = await ownArchive.json() as { data: { reports: Array<{ id: number }> } };
  assert.deepEqual(archive.data.reports.map((row) => Number(row.id)), [Number(ownReportId)]);

  const resourceResponse = await fetch(`${base}/resource-center/search?keyword=resource-needle`, { headers });
  assert.equal(resourceResponse.status, 200);
  const resources = await resourceResponse.json() as { data: Array<{ title: string }> };
  assert.deepEqual(resources.data.map((row) => row.title).sort(), ['A资料检索', '本地检索资料'], 'resource FTS remains permission and visibility scoped');

  const filteredResourceResponse = await fetch(
    `${base}/resource-center/search?keyword=resource-needle&library_type=knowledge&category_id=${searchCategoryId}&tag=%E5%86%85%E5%AE%B9%E3%80%80%E8%A7%84%E5%88%92`,
    { headers },
  );
  assert.equal(filteredResourceResponse.status, 200);
  const filteredResources = await filteredResourceResponse.json() as { data: Array<{ title: string }> };
  assert.deepEqual(filteredResources.data.map((row) => row.title), ['本地检索资料'], 'library, category and normalized tag filters compose without widening resource visibility');

  const titleSortedResponse = await fetch(`${base}/resource-center/search?keyword=resource-needle&sort=title_asc`, { headers });
  assert.equal(titleSortedResponse.status, 200);
  const titleSorted = await titleSortedResponse.json() as { data: Array<{ title: string }> };
  assert.deepEqual(titleSorted.data.map((row) => row.title), ['A资料检索', '本地检索资料'], 'title sorting uses a fixed allowlisted SQL expression');

  const recentSortedResponse = await fetch(`${base}/resource-center/search?keyword=resource-needle&sort=updated_desc`, { headers });
  assert.equal(recentSortedResponse.status, 200);
  const recentSorted = await recentSortedResponse.json() as { data: Array<{ title: string }> };
  assert.deepEqual(recentSorted.data.map((row) => row.title), ['本地检索资料', 'A资料检索'], 'recent sorting orders by update time then stable resource ID');
  assert.equal((await fetch(`${base}/resource-center/search?keyword=resource-needle&sort=unsafe`, { headers })).status, 400, 'unknown sort keys are rejected');

  const retroResponse = await fetch(`${base}/retrospectives?keyword=retro-action-needle&limit=8`, { headers });
  assert.equal(retroResponse.status, 200);
  const retros = await retroResponse.json() as { data: { retrospectives: Array<{ id: number }> } };
  assert.deepEqual(retros.data.retrospectives.map((row) => Number(row.id)), [Number(ownRetroId)], 'retrospective action bodies are included in full-text search');
  console.log('Global search HTTP tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
