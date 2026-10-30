import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 551, username: 'users-tabs-qa', role: 'director', name: '人员视图验收', enabled: true, force_change_password: false };
const listedUser = { id: 552, username: 'users-tabs-row-qa', role: 'member', name: '列表操作样例', email: 'users-tabs-row@example.test', enabled: true, force_change_password: false, created_at: '2026-09-01T00:00:00.000Z' };
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
app.get('/api/permissions/my', (_req, res) => res.json(['user:view', 'user:logs', 'user:create', 'user:update']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/users', (_req, res) => {
  usersListReads += 1;
  return res.json({ data: [listedUser], total: 1, page: 1, limit: 50 });
});
app.get('/api/users/logs', (_req, res) => {
  userLogsReads += 1;
  return res.json({ data: [], total: 0, page: 1, limit: 20 });
});
app.get('/api/users/assignable-roles', (_req, res) => res.json([{ id: 9, code: 'member', name: '普通成员' }]));
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
    if (message.type() === 'warning' && (message.text().includes('Password field is not contained in a form') || message.text().includes('Input elements should have autocomplete attributes'))) errors.push(message.text());
  });

  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '人员管理', exact: true }).waitFor();
  const views = page.getByRole('group', { name: '人员管理视图' });
  const usersTab = views.getByRole('button', { name: '用户列表', exact: true });
  const logsTab = views.getByRole('button', { name: '操作日志', exact: true });
  const userSearch = page.getByRole('textbox', { name: '搜索用户名、姓名或邮箱', exact: true });
  assert.equal(await usersTab.getAttribute('aria-pressed'), 'true', 'the initial user list is exposed as selected');
  assert.equal(await logsTab.getAttribute('aria-pressed'), 'false', 'the inactive logs view is exposed as unselected');
  await userSearch.waitFor();
  await page.getByText(listedUser.username, { exact: true }).waitFor();

  const assertTouchTargetsAt = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
    const targetSizes = await page.locator('[role="group"][aria-label="人员管理视图"] button, #users-admin-search').evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.getAttribute('aria-label') || element.textContent?.trim() || element.id,
        height: element.getBoundingClientRect().height,
      })),
    );
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(documentWidth, width, `${width}px viewport has no horizontal overflow`);
    for (const target of targetSizes) {
      assert.ok(target.height >= 40, `${target.name} is at least 40px high at ${width}px (actual ${target.height}px)`);
    }
    const addUser = page.getByRole('button', { name: '添加用户', exact: true });
    assert.ok(await addUser.isVisible(), `add-user action is visible at ${width}px`);
    const addUserHeight = await addUser.evaluate((element) => element.getBoundingClientRect().height);
    assert.ok(addUserHeight >= 40, `add-user action is at least 40px high at ${width}px (actual ${addUserHeight}px)`);
    const rowActions = await page.locator('[data-testid="user-row-actions-552"] button').evaluateAll((elements) =>
      elements.map((element) => ({ name: element.getAttribute('aria-label') || element.textContent?.trim() || 'user action', height: element.getBoundingClientRect().height })),
    );
    assert.equal(rowActions.length, 2, `both authorized user-row actions are visible at ${width}px`);
    for (const action of rowActions) {
      assert.ok(action.height >= 40, `${action.name} is at least 40px high at ${width}px (actual ${action.height}px)`);
    }
  };

  await assertTouchTargetsAt(1440, 900);
  await assertTouchTargetsAt(390, 844);
  await assertTouchTargetsAt(320, 568);
  await assertTouchTargetsAt(1440, 900);

  await logsTab.click();
  await page.getByText('暂无操作日志', { exact: true }).waitFor();
  assert.equal(await logsTab.getAttribute('aria-pressed'), 'true', 'the logs view reports selected after activation');
  assert.equal(await usersTab.getAttribute('aria-pressed'), 'false', 'the user list reports unselected while logs are visible');
  await page.getByRole('textbox', { name: '搜索操作、用户或目标', exact: true }).waitFor();

  await usersTab.click();
  await page.getByText(listedUser.username, { exact: true }).waitFor();
  assert.equal(await usersTab.getAttribute('aria-pressed'), 'true', 'returning to the user list restores its selected state');
  assert.equal(await logsTab.getAttribute('aria-pressed'), 'false', 'returning to the user list clears the logs selected state');
  await userSearch.waitFor();
  assert.equal(usersListReads, 2, 'each user-list visit performs one read');
  assert.equal(userLogsReads, 1, 'the logs view performs one read');

  await page.getByRole('button', { name: '添加用户', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: '添加用户', exact: true });
  await createDialog.waitFor();
  assert.ok(await createDialog.locator('#create-user-password').evaluate((element) => Boolean(element.closest('form'))), 'the new-user password input belongs to a form');
  for (const [fieldId, autocomplete] of Object.entries({
    'create-user-username': 'username',
    'create-user-password': 'new-password',
    'create-user-name': 'name',
    'create-user-email': 'email',
  })) {
    assert.equal(await createDialog.locator(`#${fieldId}`).getAttribute('autocomplete'), autocomplete, `${fieldId} has the appropriate autocomplete purpose`);
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : width === 390 ? 844 : 568 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(documentWidth, width, `${width}px create-form viewport has no horizontal overflow`);
    const fieldSizes = await createDialog.locator('input:not([type="checkbox"]), select').evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.id || element.getAttribute('aria-label') || element.tagName,
        height: element.getBoundingClientRect().height,
      })),
    );
    assert.equal(fieldSizes.length, 5, `all five create-form fields are present at ${width}px`);
    for (const field of fieldSizes) {
      assert.ok(field.height >= 40, `${field.name} is at least 40px high at ${width}px (actual ${field.height}px)`);
    }
  }
  await createDialog.getByRole('button', { name: '取消', exact: true }).click();
  await createDialog.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: `编辑用户 ${listedUser.username}`, exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑用户', exact: true });
  await editDialog.waitFor();
  assert.ok(await editDialog.locator('#edit-user-password').evaluate((element) => Boolean(element.closest('form'))), 'the edit-user password input belongs to a form');
  for (const [fieldId, autocomplete] of Object.entries({
    'edit-user-username': 'username',
    'edit-user-password': 'new-password',
    'edit-user-name': 'name',
    'edit-user-email': 'email',
  })) {
    assert.equal(await editDialog.locator(`#${fieldId}`).getAttribute('autocomplete'), autocomplete, `${fieldId} has the appropriate autocomplete purpose`);
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : width === 390 ? 844 : 568 });
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(documentWidth, width, `${width}px edit-form viewport has no horizontal overflow`);
    const fieldSizes = await editDialog.locator('input:not([type="checkbox"]), select').evaluateAll((elements) =>
      elements.map((element) => ({ name: element.id || element.getAttribute('aria-label') || element.tagName, height: element.getBoundingClientRect().height })),
    );
    assert.equal(fieldSizes.length, 5, `all five edit-form fields are present at ${width}px`);
    for (const field of fieldSizes) {
      assert.ok(field.height >= 40, `${field.name} is at least 40px high in edit form at ${width}px (actual ${field.height}px)`);
    }
    const enabledLabelHeight = await editDialog.locator('label[for="enabled"]').evaluate((label) => label.getBoundingClientRect().height);
    assert.ok(enabledLabelHeight >= 40, `the enable-user checkbox label is at least 40px high at ${width}px (actual ${enabledLabelHeight}px)`);
  }
  await editDialog.getByRole('button', { name: '取消', exact: true }).click();
  await editDialog.waitFor({ state: 'hidden' });
  assert.equal(businessWrites, 0, 'view switching and opening/closing the create form perform no business writes');
  assert.deepEqual(errors, [], 'the user management views render without browser errors');

  console.log('Users accessibility browser test passed: view state/search names, desktop/mobile actions and user forms meet touch sizes, with zero business writes.');
} finally {
  await browser?.close();
  await vite.close();
  io.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
