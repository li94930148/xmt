import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const version = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const user = { id: 984, username: 'shooting-create-qa', name: '成片创建验收', role: 'editor', enabled: true, force_change_password: false };
const topic = { id: 9841, title: '隔离制作计划创建验收', status: 'shooting', creator_id: user.id, assignee_id: user.id };
type Scenario = 'created-after-error' | 'not-created-after-error' | 'status-read-fails-once';
type ShootingRow = {
  id: number;
  topic_id: number;
  topic_title: string;
  topic_status: string;
  plan_date: string;
  location: string;
  equipment: string;
  status: string;
  operator_id: number;
  operator_name: string;
};
let scenario: Scenario = 'created-after-error';
let rows: ShootingRow[] = [];
let createAttempts = 0;
let createStatusReads = 0;
let requestIds: string[] = [];

function reset(nextScenario: Scenario) {
  scenario = nextScenario;
  rows = [];
  createAttempts = 0;
  createStatusReads = 0;
  requestIds = [];
}

const app = express();
app.use(express.json());
app.get('/__qa-shooting-create', (req, res) => {
  const requested = String(req.query.scenario || 'created-after-error') as Scenario;
  if (['created-after-error', 'not-created-after-error', 'status-read-fails-once'].includes(requested)) reset(requested);
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','shooting-create-fixture');localStorage.setItem('xmt_theme','dark');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/shooting');</script>`);
});
app.get('/__qa-shooting-create/state', (_req, res) => res.json({ scenario, rows, createAttempts, createStatusReads, requestIds }));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['workflow:shooting']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({ version }));
app.get('/api/topics', (_req, res) => res.json({ success: true, data: [topic], pagination: { total: 1, page: 1, limit: 20 } }));
app.get('/api/workflow/shooting', (_req, res) => res.json({ data: rows, total: rows.length, page: 1, limit: 20 }));
app.get('/api/workflow/shooting/create-request/:requestId', (req, res) => {
  createStatusReads += 1;
  if (scenario === 'status-read-fails-once' && createStatusReads === 1) return res.status(503).json({ message: '隔离验收：创建状态读取暂不可用' });
  const row = rows.find((item) => requestIds[rows.indexOf(item)] === req.params.requestId);
  if (!row) return res.status(404).json({ message: '尚未找到对应制作计划' });
  return res.json({ shootingId: row.id });
});
app.post('/api/workflow/shooting', async (req, res) => {
  createAttempts += 1;
  const requestId = String(req.body.client_request_id || '');
  requestIds.push(requestId);
  const shouldApply = scenario !== 'not-created-after-error' || createAttempts > 1;
  if (shouldApply && rows.length === 0) {
    rows.push({
      id: 9842,
      topic_id: topic.id,
      topic_title: topic.title,
      topic_status: topic.status,
      plan_date: String(req.body.plan_date || ''),
      location: String(req.body.location || ''),
      equipment: String(req.body.equipment || ''),
      status: String(req.body.status || 'planned'),
      operator_id: user.id,
      operator_name: user.name,
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (createAttempts === 1) return res.status(503).json({ message: '隔离验收：创建响应未能确认' });
  return res.json({ message: '成片制作计划添加成功', shootingId: 9842, idempotent_replay: true });
});
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', (socket) => {
  socket.on('join', (room: string) => socket.join(room));
  socket.on('leave', (room: string) => socket.leave(room));
});
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

async function closeFixture() {
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

if (process.env.XMT_SHOOTING_CREATE_RECOVERY_QA_SERVE === '1') {
  console.log(`Isolated shooting create recovery fixture: ${base}/__qa-shooting-create`);
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await closeFixture();
} else {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const unexpectedErrors: string[] = [];
    let expectedHttpErrors = 0;
    let expectedMissingStatuses = 0;
    page.on('pageerror', (error) => unexpectedErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error' || /(?:503 \(Service Unavailable\)|404 \(Not Found\))/.test(message.text())) return;
      unexpectedErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const path = new URL(response.url()).pathname;
      if (response.status() === 503 && ['/api/workflow/shooting', '/api/workflow/shooting/create-request/'].some((prefix) => path.startsWith(prefix))) {
        expectedHttpErrors += 1;
        return;
      }
      if (response.status() === 404 && path.startsWith('/api/workflow/shooting/create-request/')) {
        expectedMissingStatuses += 1;
        return;
      }
      unexpectedErrors.push(`Unexpected HTTP ${response.status()} ${path}`);
    });

    const openFixture = async (nextScenario: Scenario) => {
      await page.goto(`${base}/__qa-shooting-create?scenario=${nextScenario}`);
      await page.getByRole('heading', { name: '成片制作', exact: true }).waitFor();
      await page.getByRole('button', { name: '添加制作计划', exact: true }).first().waitFor();
    };
    const submitCreate = async () => {
      await page.getByRole('button', { name: '添加制作计划', exact: true }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('select').nth(0).selectOption(String(topic.id));
      await dialog.locator('input[type="date"]').fill('2026-10-20');
      await dialog.locator('input[type="text"]').fill('隔离测试地点');
      await dialog.locator('textarea').fill('隔离测试设备');
      await dialog.getByRole('button', { name: '保存' }).click();
    };
    const readState = async () => await page.evaluate(async () => {
      const response = await fetch('/__qa-shooting-create/state');
      return response.json() as Promise<{ createAttempts: number; createStatusReads: number; rows: ShootingRow[]; requestIds: string[] }>;
    });

    await openFixture('created-after-error');
    await submitCreate();
    await page.getByText('隔离制作计划创建验收', { exact: true }).waitFor();
    await page.getByText('没有重复提交。', { exact: false }).waitFor();
    assert.deepEqual(await readState().then(({ createAttempts, createStatusReads, rows: createdRows }) => ({ createAttempts, createStatusReads, rows: createdRows.length })), {
      createAttempts: 1,
      createStatusReads: 1,
      rows: 1,
    });
    await page.screenshot({ path: '/private/tmp/xmt-shooting-create-confirmed.png', fullPage: false });

    await openFixture('not-created-after-error');
    await submitCreate();
    await page.getByText('安全重试同一请求').waitFor();
    const beforeRetry = await readState();
    assert.equal(beforeRetry.createAttempts, 1);
    assert.equal(beforeRetry.rows.length, 0);
    await page.getByRole('button', { name: '安全重试同一请求' }).click();
    await page.getByText('隔离制作计划创建验收', { exact: true }).waitFor();
    const afterRetry = await readState();
    assert.equal(afterRetry.createAttempts, 2);
    assert.equal(afterRetry.rows.length, 1);
    assert.equal(new Set(afterRetry.requestIds).size, 1, 'explicit safe retry preserves the original idempotency key');

    await openFixture('status-read-fails-once');
    await submitCreate();
    await page.getByRole('alert').filter({ hasText: '请只读核实，不要另建一条。' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '添加制作计划', exact: true }).first().isDisabled(), true);
    assert.equal((await readState()).createAttempts, 1);
    assert.equal((await readState()).rows.length, 1);
    await page.screenshot({ path: '/private/tmp/xmt-shooting-create-pending.png', fullPage: false });
    await page.goto(`${base}/shooting`);
    await page.getByText('隔离制作计划创建验收', { exact: true }).waitFor();
    await page.getByRole('alert').waitFor({ state: 'detached' });
    const recovered = await readState();
    assert.equal(recovered.createAttempts, 1, 'reload performs no second create POST');
    assert.equal(recovered.createStatusReads, 2, 'reload recovers by GET only');
    assert.equal(recovered.rows.length, 1);
    assert.deepEqual(unexpectedErrors, [], `the isolated list renders without unexpected browser errors: ${unexpectedErrors.join(' | ')}`);
    assert.equal(expectedHttpErrors, 4, 'only the fixture-injected create/status failures return 503');
    assert.equal(expectedMissingStatuses, 1, 'the not-created branch is confirmed by the expected missing-status 404');
    console.log('Shooting create recovery browser assertions passed. Screenshots: /private/tmp/xmt-shooting-create-confirmed.png, /private/tmp/xmt-shooting-create-pending.png');
  } finally {
    await browser?.close();
    await closeFixture();
  }
}
