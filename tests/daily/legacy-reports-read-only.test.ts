import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-legacy-reports-read-only-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'legacy-reports.test.db');
process.env.JWT_SECRET = 'legacy-reports-read-only-isolated-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { default: reportsRouter } = await import('../../api/routes/reports.js');
const { signToken } = await import('../../api/utils/jwt.js');

await initDatabase();
const userId = await executeInsert(
  'INSERT INTO users(username,password,role,name,enabled) VALUES(?,?,?,?,1)',
  ['legacy-report-member', 'unused', 'member', '旧日报接口验收成员'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [userId, 'member']);
clearPermissionCache();

const app = express();
app.use(express.json());
app.use('/api/reports', reportsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/reports`;
const headers = {
  Authorization: `Bearer ${signToken({ userId })}`,
  'Content-Type': 'application/json',
};

async function insertReport(reportDate: string, status: string, content: string) {
  return executeInsert(
    'INSERT INTO daily_reports(user_id,report_date,status,content,summary,manual_summary_md,version) VALUES(?,?,?,?,?,?,1)',
    [userId, reportDate, status, content, content, content],
  );
}

function assertDeprecatedResponse(response: Response) {
  assert.equal(response.status, 410, 'deprecated report writes must be rejected without reaching legacy SQL');
  assert.equal(response.headers.get('deprecation'), 'true');
  assert.equal(response.headers.get('link'), '</api/daily-reports>; rel="successor-version"');
}

try {
  const existingDraftId = await insertReport('2099-02-01', 'draft', '仍保留的旧接口日报草稿');
  const existingSubmittedId = await insertReport('2099-02-02', 'submitted', '已提交日报正文');

  const create = await fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({ report_date: '2099-02-03', content: '不得经旧接口创建', status: 'approved' }),
  });
  assertDeprecatedResponse(create);
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM daily_reports WHERE user_id=? AND report_date=?', [userId, '2099-02-03'],
  ))?.count || 0), 0, 'legacy create must not bypass the current draft and audit service');

  const update = await fetch(`${base}/${existingSubmittedId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ content: '不得覆盖正式日报', status: 'approved' }),
  });
  assertDeprecatedResponse(update);
  assert.deepEqual(await queryOne(
    'SELECT status,content,version FROM daily_reports WHERE id=?', [existingSubmittedId],
  ), { status: 'submitted', content: '已提交日报正文', version: 1 }, 'legacy update must not alter submitted content or state');

  const remove = await fetch(`${base}/${existingDraftId}`, { method: 'DELETE', headers });
  assertDeprecatedResponse(remove);
  assert.equal(Number((await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM daily_reports WHERE id=?', [existingDraftId],
  ))?.count || 0), 1, 'legacy delete must not physically erase a report');

  const read = await fetch(`${base}/${existingSubmittedId}`, { headers });
  assert.equal(read.status, 200, 'deprecated API reads remain available during migration');
  assert.equal((await read.json() as { data: { content: string } }).data.content, '已提交日报正文');
  console.log('Legacy report read-only contract tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
