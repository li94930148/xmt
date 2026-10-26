import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Browser } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const user = { id: 991, username: 'content-timeline-qa', role: 'admin', name: '内容动态验收', enabled: true, force_change_password: false };
const firstDocumentId = 201;
const emptyDocumentId = 202;
const documents = [
  { docId: `production:${firstDocumentId}`, label: '隔离创作 A', title: '隔离创作 A', kind: 'production', updatedAt: 1 },
  { docId: `production:${emptyDocumentId}`, label: '隔离创作 B', title: '隔离创作 B', kind: 'production', updatedAt: 1 },
];

const reads = { detail: new Map<number, number>(), history: new Map<number, number>() };
const failures = new Map<string, number>();
const delayedReads = new Map<number, { pending: number; releases: Array<() => void> }>();
let writes = 0;

function increment(map: Map<number, number>, key: number) {
  map.set(key, (map.get(key) || 0) + 1);
}

function consumeFailure(key: string) {
  const remaining = failures.get(key) || 0;
  if (remaining <= 0) return false;
  failures.set(key, remaining - 1);
  return true;
}

async function maybeDelayRead(id: number) {
  const pending = delayedReads.get(id);
  if (!pending) return;
  pending.pending += 1;
  await new Promise<void>((resolve) => {
    pending.releases.push(() => {
      pending.pending -= 1;
      resolve();
    });
  });
}

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send(`<script>
  localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});
  localStorage.setItem('xmt_token','content-timeline-fixture');
  localStorage.setItem('xmt_theme','light');
  localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});
  localStorage.setItem('xmt_current_content_doc',${JSON.stringify(JSON.stringify(documents[0]))});
  localStorage.setItem('xmt_recent_content_docs',${JSON.stringify(JSON.stringify(documents))});
  location.replace('/content-timeline');
</script>`));
app.post('/__qa/fail-next-read', (req, res) => {
  const key = String(req.body?.key || '');
  failures.set(key, (failures.get(key) || 0) + 1);
  res.json({ ok: true });
});
app.post('/__qa/delay-document', (req, res) => {
  const id = Number(req.body?.id);
  delayedReads.set(id, { pending: 0, releases: [] });
  res.json({ ok: Number.isSafeInteger(id) });
});
app.post('/__qa/release-document', (req, res) => {
  const id = Number(req.body?.id);
  const delayed = delayedReads.get(id);
  delayedReads.delete(id);
  delayed?.releases.splice(0).forEach((release) => release());
  res.json({ released: Boolean(delayed) });
});
app.get('/__qa/status', (_req, res) => res.json({
  detailReads: Object.fromEntries(reads.detail),
  historyReads: Object.fromEntries(reads.history),
  delayed: Object.fromEntries([...delayedReads].map(([id, state]) => [id, state.pending])),
  writes,
}));

app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['analytics:view']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({ version, system: { defaultTheme: 'light' } }));
app.get('/api/workflow/production/:id', async (req, res) => {
  const id = Number(req.params.id);
  increment(reads.detail, id);
  await maybeDelayRead(id);
  if (consumeFailure(`${id}:detail`)) return res.status(503).json({ message: '模拟创作详情读取失败' });
  return res.json({
    id,
    topic_id: id + 1000,
    version: id === firstDocumentId ? 'A-v1' : 'B-v1',
    content: '隔离测试正文',
    status: 'draft',
    created_at: id === firstDocumentId ? '2026-10-01T09:00:00+08:00' : null,
    updated_at: id === firstDocumentId ? '2026-10-01T10:00:00+08:00' : 'not-a-valid-date',
    operator_name: '隔离成员',
  });
});
app.get('/api/workflow/production/:id/history', async (req, res) => {
  const id = Number(req.params.id);
  increment(reads.history, id);
  await maybeDelayRead(id);
  if (consumeFailure(`${id}:history`)) return res.status(503).json({ message: '模拟版本历史读取失败' });
  const data = id === firstDocumentId ? [{
    id: 2011,
    production_id: id,
    version: 'A-v1',
    created_at: '2026-10-01T08:00:00+08:00',
    operator_name: '隔离成员',
  }] : [];
  return res.json({ data, total: data.length, page: Number(req.query.page || 1), limit: Number(req.query.limit || 100) });
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
const requestedPort = Number(process.env.XMT_BROWSER_MCP_PORT) || 0;
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(requestedPort, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_CONTENT_TIMELINE_QA_SERVE === '1') {
  console.log(`Isolated content-timeline fixture: ${base}/__qa`);
  await new Promise<void>(() => {});
}

let browser: Browser | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const unexpectedErrors: string[] = [];
  const expected503s: string[] = [];
  page.on('pageerror', (error) => unexpectedErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503')) expected503s.push(message.text());
    else unexpectedErrors.push(message.text());
  });

  await fetch(`${base}/__qa/fail-next-read`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: '201:detail' }),
  });
  await page.goto(`${base}/__qa`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '内容动态', exact: true }).waitFor();
  assert.match(page.url(), /\/content-timeline$/);
  assert.equal(await page.locator('vite-error-overlay, [data-vite-error-overlay]').count(), 0, 'the page has no Vite error overlay');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'the page fits the initial 1440px desktop viewport');
  await page.getByRole('alert').getByText('创作详情暂时无法读取').waitFor();
  assert.equal(await page.getByText('这篇内容还没有可展示的动态', { exact: true }).count(), 0, 'a detail GET failure is not presented as a confirmed empty timeline');
  assert.equal(await page.getByText('读取失败，记录数暂不可用', { exact: true }).count(), 1, 'failed reads do not show zero as an authoritative record count');
  assert.equal(await page.getByText('暂不可用', { exact: true }).count(), 3, 'failed reads mark latest update and counts unavailable instead of displaying zero');
  assert.equal(await page.getByRole('button', { name: '重新读取内容动态', exact: true }).count(), 1, 'the read error has a clear recovery action');
  await page.setViewportSize({ width: 320, height: 780 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'the read error fits a 320px mobile viewport');
  assert.ok(await page.getByRole('button', { name: '重新读取内容动态', exact: true }).evaluate((button) => button.getBoundingClientRect().height >= 40), 'the recovery button meets the 40px mobile touch target');

  await page.getByRole('button', { name: '重新读取内容动态', exact: true }).click();
  await page.getByText('归档了版本 A-v1', { exact: false }).waitFor();
  assert.equal((await page.evaluate(async () => (await fetch('/__qa/status')).json())).writes, 0, 'the recovery control does not issue business writes');

  await page.evaluate(async () => {
    await fetch('/__qa/fail-next-read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: '201:history' }),
    });
  });
  await page.getByRole('button', { name: '重新读取内容动态', exact: true }).click();
  await page.getByRole('alert').getByText(/创作版本历史暂时无法读取/).waitFor();
  await page.getByRole('alert').getByText(/仍显示上次成功读取的动态，可能不是最新/).waitFor();
  assert.ok(await page.getByRole('button', { name: '重新读取内容动态', exact: true }).evaluate((button) => button.getBoundingClientRect().height >= 40), 'the history-retry button remains an accessible touch target');
  await page.getByText('归档了版本 A-v1', { exact: false }).waitFor();
  assert.equal(await page.getByText('这篇内容还没有可展示的动态', { exact: true }).count(), 0, 'a history GET failure preserves the previous confirmed timeline instead of reporting empty');
  await page.getByRole('button', { name: '重新读取内容动态', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await page.getByText('归档了版本 A-v1', { exact: false }).waitFor();

  await page.evaluate(async (id) => {
    await fetch('/__qa/delay-document', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    });
  }, firstDocumentId);
  await page.getByRole('button', { name: '查看', exact: true }).click();
  await page.waitForFunction(async (id) => {
    const status = await fetch('/__qa/status').then((response) => response.json());
    return status.delayed[id] === 2;
  }, firstDocumentId);

  await page.getByPlaceholder('选择最近协作文档或输入选题名称').fill('隔离创作 B');
  await page.getByRole('heading', { name: '隔离创作 B', exact: true }).waitFor();
  await page.getByText('这篇内容还没有可展示的动态', { exact: true }).waitFor();
  const metricValue = (label: string) => page.getByText(label, { exact: true }).locator('..').locator('p');
  assert.equal(await metricValue('最近更新').innerText(), '暂无记录', 'a successful empty document has no fabricated recent-update time');
  assert.equal(await metricValue('版本记录').innerText(), '0', 'a successful empty document reports zero versions');
  assert.equal(await metricValue('参与人员').innerText(), '0', 'a successful empty document reports zero participants');
  await page.getByText('0 次编辑会话 · 0 条有效记录', { exact: true }).waitFor();
  const statusBeforeRelease = await page.evaluate(async () => (await fetch('/__qa/status')).json());
  assert.equal(statusBeforeRelease.writes, 0, 'switching documents and showing an empty result do not issue business writes');

  await page.evaluate(async (id) => {
    await fetch('/__qa/release-document', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    });
  }, firstDocumentId);
  await page.waitForFunction(async (id) => {
    const status = await fetch('/__qa/status').then((response) => response.json());
    return status.delayed[id] === undefined;
  }, firstDocumentId);
  await page.getByRole('heading', { name: '隔离创作 B', exact: true }).waitFor();
  assert.equal(await page.getByText('归档了版本 A-v1', { exact: false }).count(), 0, 'late responses for document A cannot contaminate document B');
  await page.getByText('这篇内容还没有可展示的动态', { exact: true }).waitFor();
  const finalStatus = await page.evaluate(async () => (await fetch('/__qa/status')).json());
  assert.equal(finalStatus.writes, 0, 'all displayed recovery and switching actions remain read-only');
  assert.equal(finalStatus.detailReads[firstDocumentId], 5, 'initial read, retries, and delayed refresh use only expected detail GETs');
  assert.equal(finalStatus.historyReads[firstDocumentId], 5, 'initial read, retries, and delayed refresh use only expected history GETs');
  assert.equal(finalStatus.detailReads[emptyDocumentId], 1, 'switching to document B performs one detail GET');
  assert.equal(finalStatus.historyReads[emptyDocumentId], 1, 'switching to document B performs one history GET');
  assert.deepEqual(unexpectedErrors, [], 'the page has no unexpected browser runtime or console errors');
  assert.equal(expected503s.length, 2, 'only the two deliberately injected HTTP 503 responses reached the browser console');
  for (const viewport of [{ width: 320, height: 780 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const responsive = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      pickerHeight: document.querySelector<HTMLInputElement>('input[placeholder="选择最近协作文档或输入选题名称"]')?.getBoundingClientRect().height,
      viewButtonHeight: [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('查看'))?.getBoundingClientRect().height,
    }));
    assert.equal(responsive.fits, true, `the recovery and empty states fit a ${viewport.width}px viewport`);
    assert.ok((responsive.pickerHeight || 0) >= 40, `the document picker meets the 40px touch target at ${viewport.width}px`);
    assert.ok((responsive.viewButtonHeight || 0) >= 40, `the view button meets the 40px touch target at ${viewport.width}px`);
    if (viewport.width === 390) {
      await page.screenshot({ path: '/tmp/xmt-content-timeline-read-recovery-390.png', fullPage: false });
    }
  }
  await page.evaluate(() => localStorage.setItem('xmt_theme', 'dark'));
  await page.reload();
  await page.getByRole('heading', { name: '隔离创作 B', exact: true }).waitFor();
  await page.getByText('这篇内容还没有可展示的动态', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'the saved dark theme is applied after reload');
  for (const viewport of [{ width: 320, height: 780 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const responsive = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      pickerHeight: document.querySelector<HTMLInputElement>('input[placeholder="选择最近协作文档或输入选题名称"]')?.getBoundingClientRect().height,
      viewButtonHeight: [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('查看'))?.getBoundingClientRect().height,
    }));
    assert.equal(responsive.fits, true, `the dark-mode empty state fits a ${viewport.width}px viewport`);
    assert.ok((responsive.pickerHeight || 0) >= 40, `the dark-mode document picker meets the 40px touch target at ${viewport.width}px`);
    assert.ok((responsive.viewButtonHeight || 0) >= 40, `the dark-mode view button meets the 40px touch target at ${viewport.width}px`);
  }
  assert.equal((await page.evaluate(async () => (await fetch('/__qa/status')).json())).writes, 0, 'responsive and theme checks remain read-only');
  console.log('Content timeline read-recovery browser test passed: detail/history failures are not confirmed empty, read-only retry recovers, valid empty results remain distinct, and delayed prior-document responses do not leak.');
} finally {
  await browser?.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  if (server.listening) {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
