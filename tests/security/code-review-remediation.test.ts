import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.JWT_SECRET = 'code-review-remediation-test-secret';
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-code-review-remediation-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'test.db');

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { PERMISSION_CACHE_TTL_MS } = await import('../../api/middleware/permissions.js');
const { parseUsersPagination } = await import('../../api/routes/users.js');
const { default: socialReviewRouter } = await import('../../api/routes/social-review.js');
const { default: reportSummariesRouter } = await import('../../api/routes/report-summaries.js');

assert.deepEqual(parseUsersPagination(undefined, undefined, 20), { page: 1, limit: 20, offset: 0 });
assert.deepEqual(parseUsersPagination('-2', '100000000', 20), { page: 1, limit: 200, offset: 0 });
assert.deepEqual(parseUsersPagination('3', '50', 20), { page: 3, limit: 50, offset: 100 });
assert.deepEqual(parseUsersPagination('x', 'x', 20), { page: 1, limit: 20, offset: 0 });
assert.equal(PERMISSION_CACHE_TTL_MS, 60_000);

const workflowSource = fs.readFileSync(new URL('../../api/routes/workflow.ts', import.meta.url), 'utf8');
assert.equal(workflowSource.includes('选题?{'), false);
assert.equal((workflowSource.match(/选题「\$\{(?:topic|existingTopic)\.title\}」/g) || []).length, 4);

await initDatabase();
const memberId = await executeInsert(
  'INSERT INTO users (username, password, role, name, enabled) VALUES (?, ?, ?, ?, 1)',
  ['review-member', 'hash', 'member', 'Review Member'],
);
const adminId = await executeInsert(
  'INSERT INTO users (username, password, role, name, enabled) VALUES (?, ?, ?, ?, 1)',
  ['review-admin', 'hash', 'admin', 'Review Admin'],
);

const app = express();
app.use(express.json());
app.use('/api/social-review', socialReviewRouter);
app.use('/api/report-summaries', reportSummariesRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}/api`;

async function request(pathname: string, userId: number) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { authorization: `Bearer ${signToken({ userId })}` },
  });
  return { response, payload: await response.json() as Record<string, unknown> };
}

try {
  const denied = await request('/social-review/options', memberId);
  assert.equal(denied.response.status, 403);

  const allowed = await request('/social-review/options', adminId);
  assert.equal(allowed.response.status, 200);

  await execute('DROP TABLE social_accounts');
  const socialFailure = await request('/social-review/accounts', adminId);
  assert.equal(socialFailure.response.status, 500);
  assert.deepEqual(socialFailure.payload, {
    success: false,
    code: 'INTERNAL_ERROR',
    message: '服务暂时不可用，请稍后重试。',
  });
  assert.equal(JSON.stringify(socialFailure.payload).includes('social_accounts'), false);

  const invalidSummary = await request('/report-summaries/monthly?month=13', memberId);
  assert.equal(invalidSummary.response.status, 400);
  assert.equal(invalidSummary.payload.message, 'month 不合法');

  await execute('DROP TABLE monthly_summaries');
  const summaryFailure = await request('/report-summaries/monthly', memberId);
  assert.equal(summaryFailure.response.status, 500);
  assert.deepEqual(summaryFailure.payload, {
    success: false,
    code: 'INTERNAL_ERROR',
    message: '总结请求失败，请稍后重试。',
  });
  assert.equal(JSON.stringify(summaryFailure.payload).includes('monthly_summaries'), false);

  console.log('代码审查整改合同通过：授权、错误脱敏、分页边界与通知文案');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
