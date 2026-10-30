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
const managerId = await executeInsert(
  'INSERT INTO users(username,password,email,role,name,enabled,force_change_password) VALUES(?,?,?,?,?,1,0)',
  ['daily-audit-director', 'unused', 'daily-audit-director@example.invalid', 'director', '隔离日报审核人'],
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

async function waitForSubmitNotifications(expectedCount: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND title='新的日报待审核'",
      [managerId],
    );
    if (Number(result?.count || 0) === expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`expected ${expectedCount} submit notifications for the isolated reviewer`);
}

async function waitForReviewNotification(reportDate: string, expectedTitle: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND title=? AND content LIKE ?',
      [userId, expectedTitle, `%${reportDate}%`],
    );
    if (Number(result?.count || 0) === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`expected one ${expectedTitle} notification for ${reportDate}`);
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

  const concurrentSaveDate = '2099-01-06';
  const concurrentCreates = await Promise.all([
    post('/draft', {
      reportDate: concurrentSaveDate,
      version: 0,
      manualSummaryMd: '并发首次保存甲',
      riskLevel: 'normal',
      items: [{ sectionKey: 'done', title: '并发草稿甲', contentMd: '首次创建甲', sortOrder: 0 }],
    }),
    post('/draft', {
      reportDate: concurrentSaveDate,
      version: 0,
      manualSummaryMd: '并发首次保存乙',
      riskLevel: 'warning',
      items: [{ sectionKey: 'risk', title: '并发草稿乙', contentMd: '首次创建乙', sortOrder: 0 }],
    }),
  ]);
  assert.deepEqual(
    concurrentCreates.map((response) => response.status).sort(),
    [200, 409],
    'only one concurrent first save may create the report for a user and date',
  );
  const concurrentCreateSuccess = concurrentCreates.find((response) => response.status === 200);
  assert(concurrentCreateSuccess);
  const concurrentCreated = await concurrentCreateSuccess.json() as { data: { id: number; version: number } };
  assert.equal(concurrentCreated.data.version, 1);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM daily_reports WHERE user_id=? AND report_date=?', [userId, concurrentSaveDate]))?.count || 0), 1, 'concurrent first saves leave one report row');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='save_draft'", [concurrentCreated.data.id]))?.count || 0), 1, 'concurrent first saves create one audit');

  const concurrentUpdates = await Promise.all([
    post('/draft', {
      reportDate: concurrentSaveDate,
      version: concurrentCreated.data.version,
      manualSummaryMd: '并发更新甲',
      riskLevel: 'normal',
      items: [{ sectionKey: 'done', title: '并发更新甲', contentMd: '更新甲', sortOrder: 0 }],
    }),
    post('/draft', {
      reportDate: concurrentSaveDate,
      version: concurrentCreated.data.version,
      manualSummaryMd: '并发更新乙',
      riskLevel: 'warning',
      items: [{ sectionKey: 'risk', title: '并发更新乙', contentMd: '更新乙', sortOrder: 0 }],
    }),
  ]);
  assert.deepEqual(
    concurrentUpdates.map((response) => response.status).sort(),
    [200, 409],
    'only one update may win when both saves carry the same expected report version',
  );
  const savedConcurrentUpdate = concurrentUpdates.find((response) => response.status === 200);
  assert(savedConcurrentUpdate);
  const savedConcurrentResult = await savedConcurrentUpdate.json() as { data: { id: number; version: number } };
  assert.equal(savedConcurrentResult.data.version, 2);
  const concurrentSavedState = await queryOne<{ manual_summary_md: string; risk_level: string }>(
    'SELECT manual_summary_md,risk_level FROM daily_reports WHERE id=?', [concurrentCreated.data.id],
  );
  assert.ok(
    (concurrentSavedState?.manual_summary_md === '并发更新甲' && concurrentSavedState.risk_level === 'normal')
      || (concurrentSavedState?.manual_summary_md === '并发更新乙' && concurrentSavedState.risk_level === 'warning'),
    'the winning update is stored as one complete draft without mixing competing payloads',
  );
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM daily_report_items WHERE report_id=?', [concurrentCreated.data.id]))?.count || 0), 1, 'a losing stale save cannot replace the winning item list');
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='save_draft'", [concurrentCreated.data.id]))?.count || 0), 2, 'only the creation and winning update are audited');

  const autosaveDraftDate = '2099-01-07';
  const autosaveDraftResponse = await post('/draft', {
    reportDate: autosaveDraftDate,
    version: 0,
    manualSummaryMd: '自动保存前的草稿',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: '自动保存前', contentMd: '初始草稿内容', sortOrder: 0 }],
  });
  assert.equal(autosaveDraftResponse.status, 200);
  const autosaveDraft = await autosaveDraftResponse.json() as { data: { id: number; version: number } };
  const autosaveResponse = await post('/autosave', {
    reportDate: autosaveDraftDate,
    manualSummaryMd: '自动保存后的草稿',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: '自动保存后', contentMd: '自动保存后的内容', sortOrder: 0 }],
  });
  assert.equal(autosaveResponse.status, 200, 'autosave remains available for an existing draft');
  assert.equal((await autosaveResponse.json() as { data: { saved: boolean; report: { id: number; version: number } } }).data.saved, true);
  assert.deepEqual(
    await queryOne<{ status: string; version: number; manual_summary_md: string }>(
      'SELECT status,version,manual_summary_md FROM daily_reports WHERE id=?', [autosaveDraft.data.id],
    ),
    { status: 'draft', version: 1, manual_summary_md: '自动保存后的草稿' },
    'draft autosave changes content without changing report status or version',
  );
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='save_draft'", [autosaveDraft.data.id]))?.count || 0), 1, 'draft autosave does not create a formal save audit');

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
  await waitForSubmitNotifications(1);

  const submittedStateBeforeDuplicate = await queryOne<{ status: string; version: number; submitted_at: string }>(
    'SELECT status,version,submitted_at FROM daily_reports WHERE id=?', [draft.data.id],
  );
  const duplicateSubmit = await post(`/${draft.data.id}/submit`);
  assert.equal(duplicateSubmit.status, 409, 'a repeated direct submit is rejected after the report has already been submitted');
  assert.deepEqual(await duplicateSubmit.json(), {
    success: false,
    code: 'REPORT_LOCKED',
    message: '只有草稿或驳回状态可以提交',
  });
  assert.deepEqual(
    await queryOne<{ status: string; version: number; submitted_at: string }>(
      'SELECT status,version,submitted_at FROM daily_reports WHERE id=?', [draft.data.id],
    ),
    submittedStateBeforeDuplicate,
    'a duplicate submit does not change status, version or submitted time',
  );
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='submit'", [draft.data.id]))?.count || 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM messages WHERE user_id=? AND title='新的日报待审核'", [managerId]))?.count || 0), 1, 'a duplicate submit does not send a second review notification');

  const submittedItemsBeforeAutosave = await queryOne<{ section_key: string; title: string | null; content_md: string | null }>(
    'SELECT section_key,title,content_md FROM daily_report_items WHERE report_id=? ORDER BY id LIMIT 1', [draft.data.id],
  );
  const submittedAutosave = await post('/autosave', {
    reportDate: '2099-01-02',
    manualSummaryMd: '不允许自动改写已提交日报',
    riskLevel: 'warning',
    items: [{ sectionKey: 'risk', title: '不应替换', contentMd: '已提交内容保持不变', sortOrder: 0 }],
  });
  assert.equal(submittedAutosave.status, 409, 'autosave must not modify a submitted report');
  assert.deepEqual(
    await queryOne<{ status: string; version: number; manual_summary_md: string }>(
      'SELECT status,version,manual_summary_md FROM daily_reports WHERE id=?', [draft.data.id],
    ),
    { status: 'submitted', version: 2, manual_summary_md: '日报操作日志原子性隔离测试' },
    'a rejected submitted autosave leaves report state and summary unchanged',
  );
  assert.deepEqual(
    await queryOne<{ section_key: string; title: string | null; content_md: string | null }>(
      'SELECT section_key,title,content_md FROM daily_report_items WHERE report_id=? ORDER BY id LIMIT 1', [draft.data.id],
    ),
    submittedItemsBeforeAutosave,
    'a rejected submitted autosave leaves report items unchanged',
  );

  const concurrentDraftResponse = await post('/draft', {
    reportDate: '2099-01-04',
    manualSummaryMd: '并发重复提交只能成功一次',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: '完成', contentMd: '并发提交隔离内容', sortOrder: 0 }],
  });
  assert.equal(concurrentDraftResponse.status, 200);
  const concurrentDraft = await concurrentDraftResponse.json() as { data: { id: number; version: number } };
  const concurrentSubmissions = await Promise.all([
    post(`/${concurrentDraft.data.id}/submit`),
    post(`/${concurrentDraft.data.id}/submit`),
  ]);
  assert.deepEqual(
    concurrentSubmissions.map((response) => response.status).sort(),
    [200, 409],
    'only one concurrent direct submit may win the status compare-and-set',
  );
  assert.deepEqual(
    await queryOne<{ status: string; version: number }>('SELECT status,version FROM daily_reports WHERE id=?', [concurrentDraft.data.id]),
    { status: 'submitted', version: concurrentDraft.data.version + 1 },
    'concurrent direct submits increment the report version only once',
  );
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='submit'", [concurrentDraft.data.id]))?.count || 0), 1, 'concurrent direct submits create one submit audit');
  await waitForSubmitNotifications(2);

  const resubmissionDraftResponse = await post('/draft', {
    reportDate: '2099-01-03',
    manualSummaryMd: '驳回后可以重新提交',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: '完成', contentMd: '再次提交的隔离内容', sortOrder: 0 }],
  });
  assert.equal(resubmissionDraftResponse.status, 200);
  const resubmissionDraft = await resubmissionDraftResponse.json() as { data: { id: number; version: number } };
  assert.equal((await post(`/${resubmissionDraft.data.id}/submit`)).status, 200);
  await waitForSubmitNotifications(3);
  assert.equal((await post(`/${resubmissionDraft.data.id}/review`, { action: 'reject', comment: '请补充说明' })).status, 200);
  const rejectedAutosave = await post('/autosave', {
    reportDate: '2099-01-03',
    manualSummaryMd: '驳回状态必须经显式保存回草稿',
    riskLevel: 'warning',
    items: [{ sectionKey: 'risk', title: '静默替换', contentMd: '不应无版本修改驳回稿', sortOrder: 0 }],
  });
  assert.equal(rejectedAutosave.status, 409, 'autosave must not bypass the explicit rejected-to-draft save transition');
  assert.deepEqual(
    await queryOne<{ status: string; version: number }>('SELECT status,version FROM daily_reports WHERE id=?', [resubmissionDraft.data.id]),
    { status: 'rejected', version: 3 },
  );
  const savedAfterRejection = await post('/draft', {
    reportDate: '2099-01-03',
    version: 3,
    manualSummaryMd: '补充后重新提交',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: '完成', contentMd: '驳回后保存的隔离内容', sortOrder: 0 }],
  });
  assert.equal(savedAfterRejection.status, 200, 'a rejected report can be saved back to draft');
  assert.equal((await post(`/${resubmissionDraft.data.id}/submit`)).status, 200, 'a report can be submitted again after rejection and draft save');
  await waitForSubmitNotifications(4);
  assert.equal(Number((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action='submit'", [resubmissionDraft.data.id]))?.count || 0), 2);

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

  const concurrentReviewDate = '2099-01-05';
  const concurrentReviewDraftResponse = await post('/draft', {
    reportDate: concurrentReviewDate,
    manualSummaryMd: '并发审核只能有一个结果',
    riskLevel: 'normal',
    items: [{ sectionKey: 'done', title: '完成', contentMd: '并发审核隔离内容', sortOrder: 0 }],
  });
  assert.equal(concurrentReviewDraftResponse.status, 200);
  const concurrentReviewDraft = await concurrentReviewDraftResponse.json() as { data: { id: number } };
  assert.equal((await post(`/${concurrentReviewDraft.data.id}/submit`)).status, 200);
  await waitForSubmitNotifications(5);

  const concurrentReviews = await Promise.all([
    post(`/${concurrentReviewDraft.data.id}/review`, { action: 'approve', comment: '并行通过' }),
    post(`/${concurrentReviewDraft.data.id}/review`, { action: 'reject', comment: '并行退回' }),
  ]);
  assert.deepEqual(
    concurrentReviews.map((response) => response.status).sort(),
    [200, 409],
    'only one concurrent approval or rejection may win the submitted-state compare-and-set',
  );
  const concurrentReviewState = await queryOne<{ status: string; version: number; review_comment: string }>(
    'SELECT status,version,review_comment FROM daily_reports WHERE id=?', [concurrentReviewDraft.data.id],
  );
  assert.ok(concurrentReviewState && ['approved', 'rejected'].includes(concurrentReviewState.status));
  assert.equal(concurrentReviewState.version, 3, 'concurrent review actions increment the version only once');
  const winningReviewAction = concurrentReviewState.status === 'approved' ? 'review_approve' : 'review_reject';
  const losingReviewAction = concurrentReviewState.status === 'approved' ? 'review_reject' : 'review_approve';
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action IN (?,?)', [concurrentReviewDraft.data.id, 'review_approve', 'review_reject']))?.count || 0), 1, 'concurrent review actions create one review audit');
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action=?', [concurrentReviewDraft.data.id, winningReviewAction]))?.count || 0), 1);
  assert.equal(Number((await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM daily_report_audit_logs WHERE report_id=? AND action=?', [concurrentReviewDraft.data.id, losingReviewAction]))?.count || 0), 0);
  await waitForReviewNotification(concurrentReviewDate, concurrentReviewState.status === 'approved' ? '日报审核通过' : '日报已退回');

  assert.equal((await queryOne<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check, 'ok');
  console.log('daily report submit/review and audit transaction test passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
