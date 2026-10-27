import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 952, username: 'topics-batch-qa', role: 'admin', name: '批量操作验收', enabled: true, force_change_password: false };
const initialTopics = [
  {
    id: 951,
    title: '批量确认选题一',
    description: '只读浏览器夹具，不写入业务数据库。',
    outline: '',
    status: 'pending',
    platform: '抖音',
    creator_id: user.id,
    creator_name: user.name,
    assignee_id: user.id,
    assignee_name: user.name,
    submitted_at: '2026-10-07 09:00:00',
    created_at: '2026-10-07 09:00:00',
    deadline: '2026-10-20',
  },
  {
    id: 952,
    title: '批量确认选题二',
    description: '只读浏览器夹具，不写入业务数据库。',
    outline: '',
    status: 'pending',
    platform: '抖音',
    creator_id: user.id,
    creator_name: user.name,
    assignee_id: user.id,
    assignee_name: user.name,
    submitted_at: '2026-10-06 09:00:00',
    created_at: '2026-10-06 09:00:00',
    deadline: '2026-10-20',
  },
];

let topics = structuredClone(initialTopics);
let failNextTopicsGet = false;
let topicListGetRequests = 0;
let deleteRequests: Record<number, number> = {};
let auditRequests: Record<number, number> = {};

function resetFixture() {
  topics = structuredClone(initialTopics);
  failNextTopicsGet = false;
  topicListGetRequests = 0;
  deleteRequests = {};
  auditRequests = {};
}

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => {
  resetFixture();
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','topics-batch-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics');</script>`);
});
app.get('/__qa/state', (_req, res) => res.json({ topics, topicListGetRequests, deleteRequests, auditRequests, failNextTopicsGet }));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/topics', (_req, res) => {
  topicListGetRequests += 1;
  if (failNextTopicsGet) {
    failNextTopicsGet = false;
    return res.status(503).json({ message: '模拟批量操作后的选题列表刷新失败' });
  }
  return res.json({ data: topics, total: topics.length, page: 1, limit: 15 });
});
app.delete('/api/topics/:id', (req, res) => {
  const id = Number(req.params.id);
  deleteRequests[id] = (deleteRequests[id] || 0) + 1;
  if (id === 952) return res.status(503).json({ message: '模拟单项删除失败' });
  topics = topics.filter((topic) => topic.id !== id);
  failNextTopicsGet = true;
  return res.json({ message: '选题已删除' });
});
app.post('/api/topics/:id/audit', (req, res) => {
  const id = Number(req.params.id);
  auditRequests[id] = (auditRequests[id] || 0) + 1;
  if (id === 952) return res.status(503).json({ message: '模拟单项审核失败' });
  topics = topics.map((topic) => topic.id === id ? { ...topic, status: req.body.status } : topic);
  failNextTopicsGet = true;
  return res.json({ message: '选题审核已完成' });
});
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_TOPICS_BATCH_QA_SERVE === '1') {
  console.log(`Isolated Topics batch mutation QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const unexpectedErrors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => unexpectedErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else unexpectedErrors.push(message.text());
  });

  const selectBothTopics = async () => {
    await page.getByRole('heading', { name: '选题管理' }).waitFor();
    for (const title of initialTopics.map((topic) => topic.title)) {
      await page.getByRole('button', { name: `选择选题：${title}` }).click();
      assert.equal(await page.getByRole('button', { name: `选择选题：${title}` }).getAttribute('aria-pressed'), 'true');
    }
  };

  const waitForBatchRefreshFailure = async (action: string) => {
    const alert = page.getByRole('alert').filter({ hasText: `服务端已确认批量${action}成功 1/2 项` });
    await alert.waitFor();
    assert.match(await alert.innerText(), /刷新失败/);
    assert.match(await alert.innerText(), /失败的 1 项仍保留选择，可单独重试/);
    assert.match(await alert.innerText(), /重新加载列表只会读取数据/);
    assert.equal(await alert.getByRole('button', { name: '重新加载列表', exact: true }).count(), 1);
    return alert;
  };

  await page.goto(`${base}/__qa`);
  await selectBothTopics();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  const batchDeleteDialog = page.getByRole('dialog', { name: '确认删除选中的 2 个选题？' });
  await batchDeleteDialog.waitFor();
  assert.deepEqual((await page.request.get(`${base}/__qa/state`).then((response) => response.json())).deleteRequests, {}, 'opening batch deletion confirmation does not write');
  await batchDeleteDialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual((await page.request.get(`${base}/__qa/state`).then((response) => response.json())).deleteRequests, {}, 'cancelling batch deletion preserves every selected topic');
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('dialog', { name: '确认删除选中的 2 个选题？' }).getByRole('button', { name: '删除 2 个选题', exact: true }).click();
  const deleteAlert = await waitForBatchRefreshFailure('删除');
  await page.screenshot({ path: '/tmp/xmt-topics-batch-delete-refresh-failure.png', fullPage: false });
  const deleteFailureState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.deepEqual(deleteFailureState.deleteRequests, { 951: 1, 952: 1 }, 'each selected topic is sent one delete request');
  assert.equal(deleteFailureState.topics.length, 1, 'only the failed delete remains in fixture state');

  const deleteGetCountBeforeRetry = deleteFailureState.topicListGetRequests;
  await deleteAlert.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByRole('button', { name: `选择选题：${initialTopics[1].title}` }).waitFor();
  assert.equal(await page.getByRole('button', { name: `选择选题：${initialTopics[1].title}` }).getAttribute('aria-pressed'), 'true', 'failed deletion remains selected for an intentional retry');
  assert.equal(await page.getByRole('button', { name: `选择选题：${initialTopics[0].title}` }).count(), 0, 'confirmed deletion is absent after read-only reload');
  assert.equal(await page.getByRole('alert').filter({ hasText: '服务端已确认批量删除' }).count(), 0, 'successful list reload clears the persistent refresh warning');
  const deleteRecoveredState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(deleteRecoveredState.topicListGetRequests, deleteGetCountBeforeRetry + 1, 'delete recovery performs exactly one GET');
  assert.deepEqual(deleteRecoveredState.deleteRequests, deleteFailureState.deleteRequests, 'delete recovery does not repeat any mutation');
  await page.screenshot({ path: '/tmp/xmt-topics-batch-delete-recovered.png', fullPage: false });

  await page.goto(`${base}/__qa`);
  await selectBothTopics();
  await page.getByRole('button', { name: '通过', exact: true }).click();
  const auditAlert = await waitForBatchRefreshFailure('审核');
  await page.screenshot({ path: '/tmp/xmt-topics-batch-audit-refresh-failure.png', fullPage: false });
  const auditFailureState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.deepEqual(auditFailureState.auditRequests, { 951: 1, 952: 1 }, 'each selected topic is sent one audit request');
  assert.equal(auditFailureState.topics.find((topic: { id: number }) => topic.id === 951)?.status, 'approved', 'the server has confirmed the successful audit');
  assert.equal(auditFailureState.topics.find((topic: { id: number }) => topic.id === 952)?.status, 'pending', 'the failed audit does not change server state');

  const auditGetCountBeforeRetry = auditFailureState.topicListGetRequests;
  await auditAlert.getByRole('button', { name: '重新加载列表', exact: true }).click();
  const failedAuditSelection = page.getByRole('button', { name: `选择选题：${initialTopics[1].title}` });
  await failedAuditSelection.waitFor();
  assert.equal(await failedAuditSelection.getAttribute('aria-pressed'), 'true', 'failed audit remains selected for an intentional retry');
  const auditedRow = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: `选择选题：${initialTopics[0].title}` }) });
  await auditedRow.getByText('已通过', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').filter({ hasText: '服务端已确认批量审核' }).count(), 0, 'successful list reload clears the audit refresh warning');
  const auditRecoveredState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(auditRecoveredState.topicListGetRequests, auditGetCountBeforeRetry + 1, 'audit recovery performs exactly one GET');
  assert.deepEqual(auditRecoveredState.auditRequests, auditFailureState.auditRequests, 'audit recovery does not repeat any mutation');
  await page.screenshot({ path: '/tmp/xmt-topics-batch-audit-recovered.png', fullPage: false });

  assert.deepEqual(unexpectedErrors, [], 'isolated batch mutation flow renders without unexpected browser errors');
  assert.ok(expectedHttpErrors.length >= 4, 'fixture returns expected failures for two item writes and two post-write list reads');
  await context.close();
  console.log('Topics batch mutation browser test passed: partial delete/audit results remain distinct from GET failures; failed items stay selected; reload is GET-only and does not repeat successful writes.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
