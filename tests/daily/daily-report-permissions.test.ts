import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-daily-permissions-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'daily-permissions.test.db');
process.env.JWT_SECRET = 'daily-report-permissions-test-secret';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert, queryOne } = await import('../../api/database/utils.js');
const { clearPermissionCache } = await import('../../api/middleware/permissions.js');
const { default: dailyReportsRouter } = await import('../../api/routes/daily-reports.js');
const { signToken } = await import('../../api/utils/jwt.js');

await initDatabase();
const directorId = await executeInsert(
  'INSERT INTO users (username, password, role, name, enabled) VALUES (?, ?, ?, ?, 1)',
  ['daily-report-director', 'hash', 'director', 'Daily Report Director'],
);
const memberId = await executeInsert(
  'INSERT INTO users (username, password, role, name, enabled) VALUES (?, ?, ?, ?, 1)',
  ['daily-report-member', 'hash', 'member', 'Daily Report Member'],
);
const memberRole = await queryOne<{ id: number }>('SELECT id FROM roles WHERE code = ?', ['member']);
assert(memberRole, 'member 角色应已初始化');
await execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [memberId, memberRole.id]);
clearPermissionCache();

const app = express();
app.use(express.json());
app.use('/api/daily-reports', dailyReportsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}/api/daily-reports`;

async function saveDraft(userId: number) {
  return fetch(`${baseUrl}/draft`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${signToken({ userId })}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      reportDate: '2099-01-02',
      manualSummaryMd: '权限校验测试日报',
      riskLevel: 'normal',
      items: [{ sectionKey: 'done', title: '今日完成', contentMd: '服务端权限校验', sortOrder: 0 }],
    }),
  });
}

try {
  const forbidden = await saveDraft(directorId);
  assert.equal(forbidden.status, 403, '没有提交日报权限的角色不得直接保存草稿');

  const allowed = await saveDraft(memberId);
  assert.equal(allowed.status, 200, '具备提交日报权限的成员可以保存草稿');
  console.log('Daily report permission contract tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
