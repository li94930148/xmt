import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const version = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const editor = { id: 96, username: 'production-list-qa', role: 'editor', name: '创作列表验收', enabled: true, force_change_password: false };
const topics = [{ id: 961, title: '创作列表反馈验收选题', status: 'approved', creator_id: editor.id, assignee_id: editor.id }];
type FixtureProduction = {
  id: number;
  topic_id: number;
  version: string;
  content: string;
  status: string;
  file_path: string;
  operator_id: number;
  operator_name: string;
  topic_title: string;
  topic_status: string;
  created_at: string;
  updated_at: string;
};
const originalProduction: FixtureProduction = {
  id: 962,
  topic_id: topics[0].id,
  version: 'v1.0',
  content: '原始稿件内容',
  status: 'draft',
  file_path: '',
  operator_id: editor.id,
  operator_name: editor.name,
  topic_title: '创作列表反馈验收选题',
  topic_status: 'approved',
  created_at: '2026-10-09 09:00:00',
  updated_at: '2026-10-09 09:00:00',
};
let productions: FixtureProduction[] = [{ ...originalProduction }];
let createWrites = 0;
let updateWrites = 0;
let failNextProductionListRead = false;
let qaProductionListEnabled = false;
const mutationDelayMs = 180;
const app = express();
app.use(express.json());
app.get('/__qa-production', (req, res) => {
  qaProductionListEnabled = true;
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(editor))});localStorage.setItem('xmt_token','production-list-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/production');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(editor));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({ version }));
app.get('/api/permissions/my', (_req, res) => res.json(['topic:create', 'production:update']));
app.get('/api/topics', (req, res) => {
  const data = topics.filter((topic) => !req.query.status || topic.status === req.query.status);
  const limit = Number(req.query.limit) || 10;
  res.json({ success: true, data: data.slice(0, limit), pagination: { total: data.length, page: 1, limit } });
});
app.get('/api/workflow/production', (req, res) => {
  if (!qaProductionListEnabled || req.query.page === undefined) {
    return res.json({ data: [], total: 0, page: 1, limit: 12 });
  }
  if (failNextProductionListRead) {
    failNextProductionListRead = false;
    return res.status(503).json({ message: '隔离验收：写入后的列表刷新暂不可用' });
  }
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  return res.json({ data: productions.slice((page - 1) * limit, page * limit), total: productions.length, page, limit });
});
app.post('/api/workflow/production', async (req, res) => {
  if (!qaProductionListEnabled) return res.status(404).json({ message: '未启用隔离创作列表夹具' });
  createWrites += 1;
  const topic = topics.find((item) => item.id === Number(req.body?.topic_id));
  const created: FixtureProduction = {
    ...originalProduction,
    id: 963,
    topic_id: Number(req.body?.topic_id),
    version: String(req.body?.version ?? ''),
    content: String(req.body?.content ?? ''),
    status: String(req.body?.status ?? 'draft'),
    topic_title: topic?.title ?? '未知选题',
    created_at: '2026-10-09 10:00:00',
    updated_at: '2026-10-09 10:00:00',
  };
  productions = [created, ...productions.filter((production) => production.id !== created.id)];
  failNextProductionListRead = true;
  await new Promise((resolve) => setTimeout(resolve, mutationDelayMs));
  return res.status(201).json({ message: '创作记录已添加', productionId: created.id });
});
app.put('/api/workflow/production/:id', async (req, res) => {
  if (!qaProductionListEnabled) return res.status(404).json({ message: '未启用隔离创作列表夹具' });
  updateWrites += 1;
  const id = Number(req.params.id);
  const production = productions.find((item) => item.id === id);
  if (!production) return res.status(404).json({ message: '创作记录不存在' });
  Object.assign(production, {
    topic_id: Number(req.body?.topic_id),
    version: String(req.body?.version ?? production.version),
    content: String(req.body?.content ?? production.content),
    status: String(req.body?.status ?? production.status),
    updated_at: '2026-10-09 10:30:00',
  });
  failNextProductionListRead = true;
  await new Promise((resolve) => setTimeout(resolve, mutationDelayMs));
  return res.json({ message: '创作记录已更新' });
});
app.use('/api', (_req, res) => res.json({ success: true, data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_PRODUCTION_LIST_FEEDBACK_QA_SERVE === '1') {
  console.log(`Isolated production list feedback fixture: ${base}/__qa-production`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  const expectedConsoleErrors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const description = `${response.status()} ${response.url()}`;
    if (response.url().includes('/api/workflow/production') && response.status() === 503) expectedHttpErrors.push(description);
    else errors.push(`Unexpected HTTP error: ${description}`);
  });

  await page.goto(`${base}/__qa-production?theme=light`);
  await page.getByRole('heading', { name: '创作管理' }).waitFor();
  await page.getByText(originalProduction.topic_title, { exact: true }).waitFor();

  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.getByRole('button', { name: '添加创作' }).click();
  const lightCreateDialog = page.getByRole('dialog', { name: '添加创作记录' });
  await lightCreateDialog.waitFor();
  assert.equal(await lightCreateDialog.getAttribute('aria-modal'), 'true', 'create modal exposes dialog semantics');
  const lightCreatePanel = page.locator('.xmt-overlay > div').first();
  const lightCreateLayout = await lightCreatePanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const content = element.querySelector('.max-h-\\[min\\(70vh\\,calc\\(100dvh-12rem\\)\\)\\]');
    const surface = getComputedStyle(element).backgroundColor;
    const probe = document.createElement('span');
    element.append(probe);
    probe.style.backgroundColor = 'var(--xmt-surface)';
    const tokenSurface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, surface, tokenSurface, contentOverflowY: content ? getComputedStyle(content).overflowY : '' };
  });
  assert.ok(lightCreateLayout.left >= 0 && lightCreateLayout.right <= 320 && lightCreateLayout.top >= 0 && lightCreateLayout.bottom <= 568, `light create modal stays within the 320x568 viewport: ${JSON.stringify(lightCreateLayout)}`);
  assert.equal(lightCreateLayout.surface, lightCreateLayout.tokenSurface, 'create modal surface follows the light Studio token');
  assert.equal(lightCreateLayout.contentOverflowY, 'auto', 'modal form content scrolls inside the viewport when needed');
  await page.screenshot({ path: '/tmp/xmt-production-create-modal-light-320.png' });
  await page.keyboard.press('Escape');
  await lightCreateDialog.waitFor({ state: 'detached' });
  const productionTable = page.getByRole('table');
  const narrowTableMetrics = await productionTable.evaluate((table) => {
    const scrollport = table.parentElement;
    const actionCell = table.querySelector('tbody tr td:last-child');
    const editButton = actionCell?.querySelector('button[aria-label^="编辑创作记录"]');
    const rect = editButton?.getBoundingClientRect();
    return {
      scrollWidth: scrollport?.scrollWidth ?? 0,
      clientWidth: scrollport?.clientWidth ?? 0,
      actionPosition: actionCell ? getComputedStyle(actionCell).position : '',
      actionLeft: rect?.left ?? -1,
      actionRight: rect?.right ?? -1,
    };
  });
  assert.ok(narrowTableMetrics.scrollWidth > narrowTableMetrics.clientWidth, 'production table retains its horizontal scroll affordance on narrow screens');
  assert.equal(narrowTableMetrics.actionPosition, 'sticky', 'production row actions stay fixed while other columns scroll');
  assert.ok(narrowTableMetrics.actionLeft >= 0 && narrowTableMetrics.actionRight <= 320, `edit action stays reachable inside the 320px viewport: ${JSON.stringify(narrowTableMetrics)}`);
  await page.screenshot({ path: '/tmp/xmt-production-list-actions-light-320.png' });
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.getByRole('button', { name: '添加创作' }).click();
  await page.locator('select').first().selectOption(String(topics[0].id));
  await page.getByPlaceholder('如：v1.0').fill('v1.1');
  await page.getByPlaceholder('请输入创作内容描述').fill('通过隔离浏览器验证的新增稿件。');
  const createRequest = page.waitForResponse((response) => response.url().endsWith('/api/workflow/production') && response.request().method() === 'POST' && response.status() === 201);
  const createRefreshFailure = page.waitForResponse((response) => response.url().includes('/api/workflow/production?') && response.request().method() === 'GET' && response.status() === 503);
  const createButton = page.getByRole('button', { name: '保存', exact: true });
  await createButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  const pendingCreateButton = page.getByRole('button', { name: '保存中...', exact: true });
  await pendingCreateButton.waitFor();
  assert.equal(await pendingCreateButton.isDisabled(), true, 'create is visibly locked while the confirmed server write is pending');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog', { name: '添加创作记录' }).count(), 1, 'Escape cannot close the dialog while the create request is pending');
  await Promise.all([createRequest, createRefreshFailure]);
  await page.getByText('创建成功', { exact: true }).waitFor();
  await page.getByText('服务端已确认创作记录「创作列表反馈验收选题」（v1.1）已创建，但列表刷新失败；请重新加载列表确认，不要重复提交。', { exact: true }).waitFor();
  assert.equal(createWrites, 1, 'the server confirms one create before the list refresh fails');
  assert.equal(await page.getByText('创建成功', { exact: true }).count(), 1, 'double click produces one success notification');
  assert.equal(await page.getByRole('heading', { name: '添加创作记录', exact: true }).count(), 0, 'confirmed create closes the editor to prevent repeating the mutation');
  assert.equal(await page.getByText('创建失败', { exact: true }).count(), 0, 'a failed follow-up read is not reported as a failed create');
  await page.screenshot({ path: '/tmp/xmt-production-list-create-refresh-failure.png' });
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText(topics[0].title, { exact: true }).first().waitFor();
  assert.equal(createWrites, 1, 'list retry does not repeat the confirmed create');

  await page.goto(`${base}/__qa-production?theme=dark`);
  await page.getByRole('heading', { name: '创作管理' }).waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  const originalEditButton = page.getByTitle('编辑记录').nth(1);
  await originalEditButton.click();
  const darkEditDialog = page.getByRole('dialog', { name: '编辑创作记录' });
  await darkEditDialog.waitFor();
  assert.equal(await darkEditDialog.getAttribute('aria-modal'), 'true', 'edit modal exposes dialog semantics');
  const darkEditLayout = await page.locator('.xmt-overlay > div').first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const probe = document.createElement('span');
    element.append(probe);
    probe.style.backgroundColor = 'var(--xmt-surface)';
    const tokenSurface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, surface: getComputedStyle(element).backgroundColor, tokenSurface };
  });
  assert.ok(darkEditLayout.left >= 0 && darkEditLayout.right <= 390 && darkEditLayout.top >= 0 && darkEditLayout.bottom <= 844, `dark edit modal stays within the 390x844 viewport: ${JSON.stringify(darkEditLayout)}`);
  assert.equal(darkEditLayout.surface, darkEditLayout.tokenSurface, 'edit modal surface follows the dark Studio token');
  await page.screenshot({ path: '/tmp/xmt-production-edit-modal-dark-390.png' });
  await page.getByPlaceholder('如：v1.0').fill('v2.0');
  await page.getByPlaceholder('请输入创作内容描述').fill('通过隔离浏览器验证的已保存修订。');
  const updateRequest = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`) && response.request().method() === 'PUT' && response.status() === 200);
  const updateRefreshFailure = page.waitForResponse((response) => response.url().includes('/api/workflow/production?') && response.request().method() === 'GET' && response.status() === 503);
  const updateButton = page.getByRole('button', { name: '更新', exact: true });
  await updateButton.click();
  await Promise.all([updateRequest, updateRefreshFailure]);
  await page.getByText('更新成功', { exact: true }).waitFor();
  await page.getByText('服务端已确认创作记录「创作列表反馈验收选题」（v2.0）已保存，但列表刷新失败；请重新加载列表确认，不要重复提交。', { exact: true }).waitFor();
  assert.equal(updateWrites, 1, 'the server confirms one update before the list refresh fails');
  assert.equal(await page.getByText('更新失败', { exact: true }).count(), 0, 'a failed follow-up read is not reported as a failed update');
  assert.equal(await page.getByText('v2.0', { exact: true }).count(), 1, 'the locally confirmed update remains visible while refresh is unavailable');
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('v2.0', { exact: true }).waitFor();
  assert.equal(updateWrites, 1, 'list retry does not repeat the confirmed update');
  assert.equal(expectedHttpErrors.length, 2, 'only the two intentionally injected post-write list reads return 503');
  assert.equal(expectedConsoleErrors.length, 2, 'only the two intentionally injected list refresh 503s appear in the console');
  assert.deepEqual(errors, [], 'the production list flow renders without unexpected browser errors');
  await page.screenshot({ path: '/tmp/xmt-production-list-feedback-recovered.png' });
  await page.close();
  console.log('Production list feedback browser test passed: create/update success stays distinct from follow-up refresh failure; current state is retained, list retry succeeds without duplicate writes, and expected 503s produce no unexpected browser errors.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
