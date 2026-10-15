import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 98, username: 'activity-log-qa', role: 'admin', name: '活动日志验收', enabled: true, force_change_password: false };
const logRecord = {
  id: 981,
  user_id: 7,
  user_name: '筛选验收成员',
  action: 'update',
  target: '隔离活动日志记录',
  detail: '仅用于读取失败和恢复测试。',
  created_at: '2026-10-09T09:00:00+08:00',
};

let failNextActivityLogRead = true;
let failNextUserListRead = true;
let activityLogReads = 0;
let userListReads = 0;
let writes = 0;
const app = express();
app.post('/__qa/fail-next-activity-log-read', (_req, res) => {
  failNextActivityLogRead = true;
  res.json({ ok: true });
});
app.get('/__qa', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','activity-log-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/activity');</script>`));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['user:logs']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/users/activity-logs', (req, res) => {
  activityLogReads += 1;
  if (failNextActivityLogRead) {
    failNextActivityLogRead = false;
    return res.status(503).json({ message: '模拟活动日志读取失败' });
  }
  return res.json({ data: [logRecord], total: 1, page: Number(req.query.page || 1), limit: Number(req.query.limit || 20) });
});
app.get('/api/users', (_req, res) => {
  userListReads += 1;
  if (failNextUserListRead) {
    failNextUserListRead = false;
    return res.status(503).json({ message: '模拟成员筛选列表读取失败' });
  }
  return res.json({ data: [{ id: 7, username: 'filter-member', name: '筛选验收成员' }], total: 1, page: 1, limit: 100 });
});
app.use('/api', (req, res) => {
  if (req.method !== 'GET') writes += 1;
  res.json({ data: [], total: 0, page: 1, limit: 20 });
});

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '活动日志', exact: true }).waitFor();
  const identity = await page.evaluate(() => ({
    path: window.location.pathname,
    title: document.title,
    content: document.querySelector('#root')?.textContent?.trim() || '',
    frameworkOverlays: document.querySelectorAll('vite-error-overlay, [data-vite-error-overlay]').length,
  }));
  assert.equal(identity.path, '/activity', 'the fixture renders the requested activity-log page');
  assert.ok(identity.title && identity.content.includes('活动日志'), 'the app renders non-empty activity-log content with a document title');
  assert.equal(identity.frameworkOverlays, 0, 'the page has no Vite error overlay');
  await page.getByRole('alert').getByText(/活动日志暂时无法读取/).waitFor();
  await page.getByRole('status').getByText(/成员筛选暂不可用/).waitFor();
  assert.equal(await page.getByText('暂无活动记录', { exact: true }).count(), 0, 'an initial log read failure is not shown as an empty log');
  assert.equal(activityLogReads, 1, 'the initial activity-log failure makes one GET');

  await page.getByRole('button', { name: '重试成员筛选', exact: true }).click();
  assert.equal(await page.locator('select option[value="7"]').count(), 1, 'the member retry restores the selectable user option');
  assert.equal(userListReads, 2, 'the member-filter retry performs one read');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/xmt-activity-log-read-error-390.png' });

  await page.getByRole('button', { name: '重新加载日志', exact: true }).click();
  await page.getByText(logRecord.target, { exact: true }).waitFor();
  assert.equal(activityLogReads, 2, 'the log recovery control performs one additional GET');
  assert.equal(writes, 0, 'read recovery does not issue any write');

  await page.evaluate(async () => { await fetch('/__qa/fail-next-activity-log-read', { method: 'POST' }); });
  await page.locator('select').selectOption(String(logRecord.user_id));
  await page.getByRole('alert').getByText(/仍显示最近一次成功读取的记录/).waitFor();
  await page.getByText(logRecord.target, { exact: true }).waitFor();
  assert.equal(await page.getByText('暂无活动记录', { exact: true }).count(), 0, 'a refresh failure preserves previously loaded log records');
  assert.equal(activityLogReads, 3, 'filter refresh failure performs one GET');
  await page.getByRole('button', { name: '重新加载日志', exact: true }).click();
  await page.getByText(logRecord.target, { exact: true }).waitFor();
  assert.equal(activityLogReads, 4, 'retrying the filtered log view performs one additional GET');
  assert.equal(userListReads, 2, 'activity-log retries do not repeat the member-list read');
  assert.equal(writes, 0, 'all recovery actions remain read-only');
  assert.equal(expectedHttpErrors.length, 3, 'the browser records only the three intentionally injected read failures');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'the activity-log recovery view fits a 390px viewport');
  assert.deepEqual(errors, [], 'the activity-log page has no unexpected browser errors');
  console.log('Activity-log browser test passed: log and member reads recover independently, initial errors do not masquerade as empty data, stale records remain visible, and retries are read-only.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
