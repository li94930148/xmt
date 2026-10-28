import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 551, username: 'users-tabs-qa', role: 'director', name: '人员视图验收', enabled: true, force_change_password: false };
const app = express();
app.use(express.json());
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

let usersListReads = 0;
let userLogsReads = 0;
let businessWrites = 0;

app.get('/__qa', (_req, res) => res.type('html').send(
  `<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','users-tabs-selected-state-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/users');</script>`,
));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['user:view', 'user:logs']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/users', (_req, res) => {
  usersListReads += 1;
  return res.json({ data: [], total: 0, page: 1, limit: 50 });
});
app.get('/api/users/logs', (_req, res) => {
  userLogsReads += 1;
  return res.json({ data: [], total: 0, page: 1, limit: 20 });
});
app.use('/api', (req, res) => {
  if (req.method !== 'GET') businessWrites += 1;
  return res.json({ data: [], total: 0, page: 1, limit: 20 });
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

if (process.env.XMT_USERS_TABS_QA_SERVE === '1') {
  console.log(`Isolated users tabs QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  const views = page.getByRole('group', { name: '人员管理视图' });
  const usersTab = views.getByRole('button', { name: '用户列表', exact: true });
  const logsTab = views.getByRole('button', { name: '操作日志', exact: true });
  assert.equal(await usersTab.getAttribute('aria-pressed'), 'true', 'the initial user list is exposed as selected');
  assert.equal(await logsTab.getAttribute('aria-pressed'), 'false', 'the inactive logs view is exposed as unselected');

  await logsTab.click();
  await page.getByText('暂无操作日志', { exact: true }).waitFor();
  assert.equal(await logsTab.getAttribute('aria-pressed'), 'true', 'the logs view reports selected after activation');
  assert.equal(await usersTab.getAttribute('aria-pressed'), 'false', 'the user list reports unselected while logs are visible');

  await usersTab.click();
  await page.getByText('暂无用户', { exact: true }).waitFor();
  assert.equal(await usersTab.getAttribute('aria-pressed'), 'true', 'returning to the user list restores its selected state');
  assert.equal(await logsTab.getAttribute('aria-pressed'), 'false', 'returning to the user list clears the logs selected state');
  assert.equal(usersListReads, 2, 'each user-list visit performs one read');
  assert.equal(userLogsReads, 1, 'the logs view performs one read');
  assert.equal(businessWrites, 0, 'switching views performs no business writes');
  assert.deepEqual(errors, [], 'the user management views render without browser errors');

  console.log('Users selected-state browser test passed: both views expose accurate state and remain read-only.');
} finally {
  await browser?.close();
  await vite.close();
  io.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
