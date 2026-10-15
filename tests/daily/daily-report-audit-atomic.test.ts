import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-daily-audit-atomic-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'daily-audit-atomic.db');
process.env.JWT_SECRET = 'daily-report-audit-atomic-isolated-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { default: routes } = await import('../../api/routes/daily-reports.js');
const { signToken } = await import('../../api/utils/jwt.js');

await initDatabase();
const userId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['daily-audit-admin', 'unused', 'daily-audit@example.invalid', 'admin', '隔离日报管理员'],
);
await execute('INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [userId, 'admin']);
clearPermissionCache();

const app = express();
app.use(express.json());
app.use('/api/daily-reports', routes);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}/api/daily-reports`;
const headers = {
  Authorization: `Bearer ${signToken({ userId })}`,
  'Content-Type': 'application/json',
};

async function post(pathname: string, body?: unknown) {
  return fetch(`${base}${pathname}`, {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

try {
  const draftResponse = await post('/draft', {
    reportDate: '2099-01-02',
    manualSummaryMd: '日报操作日志原子性隔离测试',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: '完成', contentMd: '只写入临时数据库', sortOrder: 0 }],
  });
  assert.equal(draftResponse.status, 200, 'the isolated admin can create a report draft');
  const draft = await draftResponse.json() as { data: { id: number; version: number } };
  assert.equal(draft.data.version, 1);

  await execute(`
    CREATE TRIGGER reject_daily_submit_audit
    BEFORE INSERT ON daily_report_audit_logs
    WHEN NEW.action = 'submit'
    BEGIN SELECT RAISE(ABORT, 'simulated submit audit failure'); END
  `);
  const failedSubmit = await post(`/${draft.data.id}/submit`);
  assert.equal(failedSubmit.status, 500, 'audit failure must fail the submit request');
  assert.deepEqual(await failedSubmit.json(), {
    success: false,
    code: 'INTERNAL_ERROR',
    message: '日报服务异常',
  }, 'database trigger details are not exposed to the caller');
  assert.deepEqual(
    await queryOne<{ status: string; version: number }>('SELECT status,version FROM daily_reports WHERE id=?', [draft.data.id]),
    { status: 'draft', version: 1 },
    'submit state and version roll back when its audit record fails',
  );
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='submit'", [draft.data.id]))?.count || 0), 0);

  await execute('DROP TRIGGER reject_daily_submit_audit');
  const submitted = await post(`/${draft.data.id}/submit`);
  assert.equal(submitted.status, 200, 'submit succeeds after the isolated audit failure is removed');
  assert.deepEqual(
    await queryOne<{ status: string; version: number }>('SELECT status,version FROM daily_reports WHERE id=?', [draft.data.id]),
    { status: 'submitted', version: 2 },
  );
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='submit'", [draft.data.id]))?.count || 0), 1);

  await execute(`
    CREATE TRIGGER reject_daily_review_audit
    BEFORE INSERT ON daily_report_audit_logs
    WHEN NEW.action = 'review_approve'
    BEGIN SELECT RAISE(ABORT, 'simulated review audit failure'); END
  `);
  const failedReview = await post(`/${draft.data.id}/review`, { action: 'approve', comment: '原子性测试' });
  assert.equal(failedReview.status, 500, 'audit failure must fail the review request');
  assert.deepEqual(await failedReview.json(), {
    success: false,
    code: 'INTERNAL_ERROR',
    message: '日报服务异常',
  });
  assert.deepEqual(
    await queryOne<{ status: string; version: number; reviewed_by: number | null; review_comment: string }>(
      'SELECT status,version,reviewed_by,review_comment FROM daily_reports WHERE id=?', [draft.data.id],
    ),
    { status: 'submitted', version: 2, reviewed_by: null, review_comment: null },
    'review status, reviewer, comment and version roll back when its audit record fails',
  );
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='review_approve'", [draft.data.id]))?.count || 0), 0);

  await execute('DROP TRIGGER reject_daily_review_audit');
  const reviewed = await post(`/${draft.data.id}/review`, { action: 'approve', comment: '原子性测试' });
  assert.equal(reviewed.status, 200, 'review succeeds after the isolated audit failure is removed');
  assert.deepEqual(
    await queryOne<{ status: string; version: number; reviewed_by: number | null; review_comment: string }>(
      'SELECT status,version,reviewed_by,review_comment FROM daily_reports WHERE id=?', [draft.data.id],
    ),
    { status: 'approved', version: 3, reviewed_by: userId, review_comment: '原子性测试' },
  );
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='review_approve'", [draft.data.id]))?.count || 0), 1);
  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  console.log('daily report submit/review and audit transaction test passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
