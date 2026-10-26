import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const announcements = [{
  id: 101,
  content: '保留的系统公告',
  type: 'announcement',
  pinned: true,
  creator_id: 901,
  creator_name: '公告条验收',
  created_at: '2026-10-09T12:00:00+08:00',
  updated_at: '2026-10-09T12:00:00+08:00',
}];
let listRequests = 0;
let failNextList = false;
const mutations: string[] = [];

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/browser/announcement-strip-harness.tsx"></script></body></html>'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.post('/__qa/options', (req, res) => {
  if (typeof req.body?.failNextList === 'boolean') failNextList = req.body.failNextList;
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
app.all('/api/announcements', (req, res) => {
  mutations.push(`${req.method} /api/announcements`);
  res.status(405).json({ message: '公告条验收不允许写入' });
});

const server = http.createServer(app);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_ANNOUNCEMENT_STRIP_QA_SERVE === '1') {
  console.log(`Isolated announcement strip QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
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
  const strip = page.getByTestId('home-announcement-strip');
  await strip.getByText('公告暂时无法读取', { exact: true }).waitFor();
  assert.equal(await strip.getByText('暂无公告', { exact: true }).count(), 0, 'a failed read is not presented as an empty announcement list');
  await strip.getByRole('button', { name: '重试', exact: true }).click();
  await strip.getByText('保留的系统公告', { exact: true }).waitFor();
  assert.equal(await strip.getByText('置顶', { exact: true }).count(), 1, 'the topbar strip highlights a pinned announcement');
  assert.equal(listRequests, 2, 'the failed read is recovered with one read-only retry');

  await strip.getByRole('button', { name: '查看公告', exact: true }).click();
  await page.getByRole('heading', { name: '公告板' }).waitFor();
  assert.equal(await page.getByText('保留的系统公告', { exact: true }).count(), 1, 'the compact strip expands into the existing announcement board');
  assert.equal(listRequests, 3, 'expanding the board performs one current list read');
  const widthState = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  assert(widthState.document <= widthState.viewport, `the compact strip and expanded board fit at 320px: ${JSON.stringify(widthState)}`);

  await strip.getByRole('button', { name: '收起公告板', exact: true }).click();
  await strip.getByText('保留的系统公告', { exact: true }).waitFor();
  assert.equal(listRequests, 4, 'closing the board refreshes the compact strip with a read-only request');

  await page.goto(`${base}/__qa?role=editor`);
  const editorStrip = page.getByTestId('home-announcement-strip');
  await editorStrip.getByText('保留的系统公告', { exact: true }).waitFor();
  await editorStrip.getByRole('button', { name: '查看公告', exact: true }).click();
  await page.getByRole('heading', { name: '公告板' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '添加公告' }).count(), 0, 'users without announcement-management permission do not see create controls');
  assert.equal(await page.getByRole('button', { name: /删除公告/ }).count(), 0, 'users without announcement-management permission do not see delete controls');
  assert.deepEqual(mutations, [], 'the strip and read-only board never issue write requests');
  assert.equal(expectedHttpErrors.length, 1, 'the single intentional unavailable response is reported once');
  assert.deepEqual(errors, [], 'the announcement strip has no browser runtime or unexpected console errors');
  await context.close();
  console.log('Announcement strip browser test passed: retryable read, pinned announcement, expand/collapse, 320px fit and read-only permission boundaries.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
