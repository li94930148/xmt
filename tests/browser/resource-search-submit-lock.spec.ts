import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const fixtureOnly = process.env.XMT_RESOURCE_SEARCH_FIXTURE_ONLY === '1';
const user = { id: 991, username: 'resource-search-qa', name: '资料搜索验收', role: 'admin', enabled: true, force_change_password: false };
let searchRequests = 0;
const searchQueries: string[] = [];
const searchLibraryTypes: string[] = [];
const completedSearches: number[] = [];
const pendingSearches = new Map<number, () => void>();

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','resource-search-fixture');localStorage.setItem('xmt_theme','dark');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/asset-center/search');</script>`));
app.get('/__qa/state', (_req, res) => res.json({ searchRequests, searchQueries, searchLibraryTypes, completedSearches }));
app.post('/__qa/release/:id', (_req, res) => {
  const id = Number(_req.params.id);
  const release = pendingSearches.get(id);
  if (!release) return res.status(404).json({ message: '搜索请求尚未挂起' });
  pendingSearches.delete(id);
  release();
  return res.json({ released: true });
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/resource-center/categories', (_req, res) => res.json({ data: [] }));
app.get('/api/resource-center/search', async (req, res) => {
  const id = ++searchRequests;
  const query = String(req.query.keyword || '');
  searchQueries.push(query);
  searchLibraryTypes.push(String(req.query.library_type || ''));
  await new Promise<void>((resolve) => pendingSearches.set(id, resolve));
  completedSearches.push(id);
  return res.json({ data: [{
    resource_id: 990 + id,
    title: `${query}结果${id}`,
    summary: null,
    snippet: `${query}的隔离搜索结果`,
    library_type: 'knowledge',
    category: null,
  }], total: 1 });
});
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

async function closeFixture() {
  for (const release of pendingSearches.values()) release();
  pendingSearches.clear();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

if (fixtureOnly) {
  console.log(`isolated resource search fixture ready at ${base}/__qa`);
  await new Promise<void>((resolve) => {
    const stop = () => { resolve(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  await closeFixture();
} else {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/__qa`);
    await page.getByRole('heading', { name: '资料搜索', exact: true }).waitFor();

    const keyword = page.getByRole('textbox', { name: '搜索资料关键词' });
    const form = page.locator('form');
    const searchButton = page.getByRole('button', { name: '搜索', exact: true });
    await keyword.fill('旧关键词');
    await form.evaluate((node) => {
      const target = node as HTMLFormElement;
      target.requestSubmit();
      target.requestSubmit();
    });
    await page.waitForFunction(async () => (await fetch('/__qa/state').then((response) => response.json())).searchRequests === 1);
    await page.waitForTimeout(100);
    const initialPendingState = await fetch(`${base}/__qa/state`).then((response) => response.json()) as { searchRequests: number; searchQueries: string[] };
    assert.equal(initialPendingState.searchRequests, 1, 'same-tick duplicate submits issue only one search GET');
    assert.deepEqual(initialPendingState.searchQueries, ['旧关键词']);
    assert.equal(await keyword.isEnabled(), true, 'the user can change their query while a read is pending');
    assert.equal(await searchButton.isDisabled(), true, 'the submit control stays disabled while its search is pending');
    assert.equal(await form.getAttribute('aria-busy'), 'true', 'the pending search is announced as busy');
    assert.equal(await searchButton.innerText(), '搜索中…', 'the button communicates that results are loading');

    await keyword.fill('新关键词');
    assert.equal(await searchButton.isEnabled(), true, 'changing filters releases the previous query lock');
    await form.evaluate((node) => (node as HTMLFormElement).requestSubmit());
    await page.waitForFunction(async () => (await fetch('/__qa/state').then((response) => response.json())).searchRequests === 2);
    await fetch(`${base}/__qa/release/2`, { method: 'POST' });
    await page.getByRole('heading', { name: '新关键词结果2', exact: true }).waitFor();
    await fetch(`${base}/__qa/release/1`, { method: 'POST' });
    await page.waitForFunction(async () => (await fetch('/__qa/state').then((response) => response.json())).completedSearches.includes(1));
    await page.getByRole('heading', { name: '新关键词结果2', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '旧关键词结果1', exact: true }).count(), 0, 'an older held result cannot replace the latest query');
    assert.deepEqual(searchQueries, ['旧关键词', '新关键词'], 'same-tick duplicate submits issue only one GET and a changed query can start a new GET');
    assert.equal(await searchButton.isEnabled(), true, 'the search control is restored after the latest result arrives');
    assert.equal(await form.getAttribute('aria-busy'), 'false', 'the form leaves the busy state after the latest result arrives');

    await keyword.fill('筛选关键词');
    await form.evaluate((node) => (node as HTMLFormElement).requestSubmit());
    await page.waitForFunction(async () => (await fetch('/__qa/state').then((response) => response.json())).searchRequests === 3);
    await page.getByRole('combobox', { name: '资料库' }).selectOption('knowledge');
    await page.waitForFunction(() => {
      const submit = document.querySelector('form button[type="submit"]');
      return submit instanceof HTMLButtonElement && !submit.disabled;
    });
    await form.evaluate((node) => (node as HTMLFormElement).requestSubmit());
    await page.waitForFunction(async () => (await fetch('/__qa/state').then((response) => response.json())).searchRequests === 4);
    const filteredRequests = await fetch(`${base}/__qa/state`).then((response) => response.json()) as { searchLibraryTypes: string[] };
    assert.deepEqual(filteredRequests.searchLibraryTypes, ['', '', '', 'knowledge'], 'changing a library filter invalidates the pending query and submits with the new filter');
    await fetch(`${base}/__qa/release/4`, { method: 'POST' });
    await page.getByRole('heading', { name: '筛选关键词结果4', exact: true }).waitFor();
    await fetch(`${base}/__qa/release/3`, { method: 'POST' });
    await page.waitForFunction(async () => (await fetch('/__qa/state').then((response) => response.json())).completedSearches.includes(3));
    assert.deepEqual(await page.locator('h2').allTextContents(), ['筛选关键词结果4'], 'a late response from the old filter cannot replace the current filtered result');
    assert.deepEqual(searchQueries, ['旧关键词', '新关键词', '筛选关键词', '筛选关键词']);
    assert.equal(await searchButton.isEnabled(), true, 'the submit control is restored after filtered results arrive');
    assert.equal(await form.getAttribute('aria-busy'), 'false', 'the form leaves the busy state after filtered results arrive');

    await page.screenshot({ path: '/tmp/xmt-resource-search-results-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 800 });
    const geometry = await page.evaluate(() => ({ viewportWidth: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth }));
    assert.equal(geometry.documentWidth, geometry.viewportWidth, 'resource search has no horizontal document overflow at 320px');
    await page.screenshot({ path: '/tmp/xmt-resource-search-results-mobile-320.png', fullPage: true });
    assert.deepEqual(errors, [], 'the isolated search flow renders without browser console or runtime errors');
    console.log('resource search duplicate-submit and stale-response browser tests passed');
  } finally {
    await browser?.close().catch(() => undefined);
    await closeFixture();
  }
}
