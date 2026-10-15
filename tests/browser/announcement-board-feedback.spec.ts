import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const existing = {
  id: 101,
  content: '保留的系统公告',
  type: 'announcement',
  pinned: true,
  creator_id: 901,
  creator_name: '公告验收',
  created_at: '2026-10-09T12:00:00+08:00',
  updated_at: '2026-10-09T12:00:00+08:00',
};
let announcements = [existing];
let nextId = 102;
let listRequests = 0;
let createRequests = 0;
let deleteRequests = 0;
let failNextList = false;
let failNextDelete = false;
let createDelayMs = 0;
let deleteDelayMs = 0;

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/browser/announcement-board-harness.tsx"></script></body></html>'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.post('/__qa/options', (req, res) => {
  if (typeof req.body?.failNextList === 'boolean') failNextList = req.body.failNextList;
  if (typeof req.body?.failNextDelete === 'boolean') failNextDelete = req.body.failNextDelete;
  if (Number.isFinite(req.body?.createDelayMs)) createDelayMs = Math.max(0, Number(req.body.createDelayMs));
  if (Number.isFinite(req.body?.deleteDelayMs)) deleteDelayMs = Math.max(0, Number(req.body.deleteDelayMs));
  res.json({ ready: true });
});
app.get('/api/permissions/my', (_req, res) => res.json([]));
app.get('/api/announcements', (_req, res) => {
  listRequests += 1;
  if (failNextList) {
    failNextList = false;
    res.status(503).json({ message: '隔离公告列表暂不可用' });
    return;
  }
  res.json({ data: announcements });
});
app.post('/api/announcements', async (req, res) => {
  createRequests += 1;
  if (createDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, createDelayMs));
  const now = '2026-10-09T12:01:00+08:00';
  const created = {
    id: nextId++,
    content: String(req.body?.content ?? ''),
    type: String(req.body?.type ?? 'note'),
    pinned: Boolean(req.body?.pinned),
    creator_id: 901,
    creator_name: '公告验收',
    created_at: now,
    updated_at: now,
  };
  announcements = [created, ...announcements];
  res.json({ message: '公告创建成功', id: created.id });
});
app.delete('/api/announcements/:id', async (req, res) => {
  deleteRequests += 1;
  if (deleteDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, deleteDelayMs));
  if (failNextDelete) {
    failNextDelete = false;
    res.status(503).json({ message: '隔离公告删除失败' });
    return;
  }
  announcements = announcements.filter((item) => item.id !== Number(req.params.id));
  res.json({ message: '公告删除成功' });
});

const server = http.createServer(app);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_ANNOUNCEMENT_QA_SERVE === '1') {
  console.log(`Isolated announcement board QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  failNextList = true;
  await page.goto(`${base}/__qa`);
  await page.getByText('公告列表不可用，请重新加载后再查看。', { exact: true }).waitFor();
  assert.equal(await page.getByText('暂无公告', { exact: true }).count(), 0, 'a failed initial read must not be presented as an empty board');
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('保留的系统公告', { exact: true }).waitFor();
  assert.equal(listRequests, 2, 'initial error recovery is a read-only retry');

  await page.getByRole('button', { name: '添加公告' }).click();
  await page.getByPlaceholder('输入公告内容...').fill('新公告隔离记录');
  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ createDelayMs: 220, failNextList: true }) });
  });
  await page.getByRole('button', { name: '发布', exact: true }).dblclick();
  await page.getByText('服务端已确认公告发布，但公告列表暂未刷新；请重新加载列表确认，不要重复发布。', { exact: true }).waitFor();
  assert.equal(createRequests, 1, 'duplicate clicks issue one announcement create request');
  assert.equal(await page.getByText('保留的系统公告', { exact: true }).count(), 1, 'existing list rows remain when the post-create refresh fails');
  assert.equal(await page.getByText('新公告隔离记录', { exact: true }).count(), 0, 'the UI does not fabricate a local announcement row without server details');

  const postCreateReadCount = listRequests;
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('新公告隔离记录', { exact: true }).waitFor();
  assert.equal(listRequests, postCreateReadCount + 1, 'create recovery only reloads the list');
  assert.equal(createRequests, 1, 'read-only recovery never repeats the confirmed create');

  const createdDeleteButton = page.getByRole('button', { name: '删除公告：新公告隔离记录' });
  await createdDeleteButton.click();
  await page.getByRole('heading', { name: '确认删除公告？' }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(deleteRequests, 0, 'canceling the destructive confirmation sends no delete request');

  await page.getByRole('button', { name: '删除公告：新公告隔离记录' }).click();
  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleteDelayMs: 220, failNextDelete: true }) });
  });
  await page.getByRole('button', { name: '删除公告', exact: true }).dblclick();
  await page.getByText('删除公告失败', { exact: true }).waitFor();
  assert.equal(deleteRequests, 1, 'a failed delete double-click issues one request');
  assert.equal(await page.getByRole('button', { name: '删除公告：新公告隔离记录' }).count(), 1, 'failed delete keeps the announcement row');
  assert.equal(await page.getByRole('heading', { name: '确认删除公告？' }).count(), 1, 'failed delete keeps its confirmation available for explicit retry');

  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextList: true }) });
  });
  await page.getByRole('button', { name: '删除公告', exact: true }).click();
  await page.getByText('服务端已确认删除公告，但公告列表暂未刷新；请重新加载列表确认，不要重复删除。', { exact: true }).waitFor();
  assert.equal(deleteRequests, 2, 'the explicit retry confirms deletion exactly once');
  assert.equal(await page.getByRole('heading', { name: '确认删除公告？' }).count(), 0, 'confirmed deletion closes the destructive confirmation');
  assert.equal(await page.getByRole('button', { name: '删除公告：新公告隔离记录' }).count(), 0, 'confirmed deletion immediately removes the current row');
  const postDeleteReadCount = listRequests;
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('公告列表已重新加载，先前操作已确认。', { exact: true }).waitFor();
  assert.equal(listRequests, postDeleteReadCount + 1, 'delete recovery only reloads the list');
  assert.equal(deleteRequests, 2, 'read-only recovery never repeats the confirmed delete');

  await page.goto(`${base}/__qa?role=editor`);
  await page.getByText('保留的系统公告', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '添加公告' }).count(), 0, 'users without system:announcement do not see create controls');
  assert.equal(await page.getByRole('button', { name: /删除公告/ }).count(), 0, 'users without system:announcement do not see delete controls');
  assert.equal(expectedHttpErrors.length, 4, 'initial load, post-create refresh, failed delete, and post-delete refresh each yield one intentional 503');
  assert.deepEqual(errors, [], 'announcement board has no browser runtime or unexpected console errors');
  await context.close();
  console.log('Announcement board browser test passed: initial read retry, create/delete confirmation, duplicate-write protection, confirmed-write recovery and permission-scoped controls at 390px.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
