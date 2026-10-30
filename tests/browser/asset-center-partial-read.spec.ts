import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 94, username: 'asset-center-qa', role: 'admin', name: '资料中心隔离验收', enabled: true, force_change_password: false };
const totals = { project: 3, content_archive: 5, knowledge: 7, media: 11 } as const;
let resourceReads = 0;
let resourceMutations = 0;
let mediaFailuresRemaining = 1;

const app = express();
app.use(express.json());
app.get('/__qa', (request, response) => {
  const theme = request.query.theme === 'dark' ? 'dark' : 'light';
  response.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','asset-center-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/asset-center');</script>`);
});
app.get('/__qa/state', (_request, response) => response.json({ resourceReads, resourceMutations, mediaFailuresRemaining }));
app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/permissions/my', (_request, response) => response.json(['resource:view']));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_request, response) => response.json({}));
app.use('/api/resource-center', (request, _response, next) => {
  if (request.method !== 'GET') resourceMutations += 1;
  next();
});
app.get('/api/resource-center/resources', (request, response) => {
  resourceReads += 1;
  const libraryType = String(request.query.library_type) as keyof typeof totals;
  if (!(libraryType in totals)) return response.status(400).json({ message: '资料库类型无效' });
  if (libraryType === 'media' && mediaFailuresRemaining > 0) {
    mediaFailuresRemaining -= 1;
    return response.status(503).json({ message: '模拟素材归档库暂时不可用' });
  }
  return response.json({ data: [], pagination: { page: 1, page_size: 1, total: totals[libraryType], total_pages: totals[libraryType] ? totals[libraryType] : 0 } });
});
app.use('/api', (_request, response) => response.json({ data: [] }));

async function assertResponsiveLayout(page: Page, width: number, height: number, theme: 'light' | 'dark') {
  await page.setViewportSize({ width, height });
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const cards = [...document.querySelectorAll<HTMLAnchorElement>('main a[href^="/asset-center/"]')]
      .filter((card) => card.getAttribute('href') !== '/asset-center/search')
      .map((card) => {
        const rect = card.getBoundingClientRect();
        return { label: card.innerText.trim().replace(/\s+/g, ' '), left: Math.round(rect.left), right: Math.round(rect.right) };
      });

    return {
      theme: root.classList.contains('dark') ? 'dark' : 'light',
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      cards,
    };
  });

  assert.equal(layout.theme, theme, `${width}px ${theme} theme is applied`);
  assert.equal(layout.scrollWidth, layout.clientWidth, `${width}px ${theme} page has no horizontal overflow`);
  assert.equal(layout.cards.length, 6, 'all six library and archive cards remain present');
  assert.ok(layout.cards.every((card) => card.left >= 0 && card.right <= layout.clientWidth), `${width}px ${theme} cards remain inside the viewport: ${JSON.stringify(layout.cards)}`);
}

async function assertSelectedSidebarItem(page: Page, label: string) {
  const navigation = page.getByRole('complementary').getByRole('navigation');
  const currentItems = navigation.locator('[aria-current="page"]');
  assert.equal(await currentItems.count(), 1, `${label} route has exactly one current sidebar item`);
  const item = navigation.getByRole('button', { name: label, exact: true });
  assert.equal(await item.getAttribute('aria-current'), 'page', `${label} is announced as the current page`);
  const className = await item.getAttribute('class');
  assert.ok(className?.includes('border-studio-border-active'), `${label} is selected in the desktop sidebar`);
}

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_ASSET_CENTER_QA_SERVE === '1') {
  console.log(`Isolated asset center QA fixture: ${base}/__qa`);
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(0);
}

let browser: Browser | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  const expectedFixtureErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location().url;
    if (message.text().includes('503') && location.includes('/api/resource-center/resources') && location.includes('library_type=media')) {
      expectedFixtureErrors.push(message.text());
      return;
    }
    errors.push(message.text());
  });

  await page.goto(`${base}/__qa?theme=light`, { waitUntil: 'domcontentloaded' });
  assert.equal(page.url(), `${base}/asset-center`, 'the fixture route redirects to the asset center');
  assert.equal(await page.title(), '新媒体协作管理系统', 'the app shell has the expected page title');
  const main = page.getByRole('main');
  await main.getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  const projectLibrary = main.getByRole('link', { name: /项目资料库/ });
  const contentLibrary = main.getByRole('link', { name: /内容档案库/ });
  const knowledgeLibrary = main.getByRole('link', { name: /知识库/ });
  const mediaLibrary = main.getByRole('link', { name: /素材归档库/ });
  const destinations = [
    { link: projectLibrary, path: '/asset-center/resources?library_type=project', heading: '项目资料库', sidebar: '项目资料库' },
    { link: contentLibrary, path: '/asset-center/resources?library_type=content_archive', heading: '内容档案库', sidebar: '内容档案库' },
    { link: knowledgeLibrary, path: '/asset-center/knowledge', heading: '知识库', sidebar: '知识库' },
    { link: mediaLibrary, path: '/asset-center/resources?library_type=media', heading: '素材归档库', sidebar: '素材归档' },
  ];

  await main.getByRole('alert').getByText(/其他资料库仍可用/).waitFor();
  assert.equal(await projectLibrary.getByText('3', { exact: true }).count(), 1, 'successful project count remains visible after an unrelated library read fails');
  assert.equal(await contentLibrary.getByText('5', { exact: true }).count(), 1, 'successful content archive count remains visible');
  assert.equal(await knowledgeLibrary.getByText('7', { exact: true }).count(), 1, 'successful knowledge count remains visible');
  assert.equal(await mediaLibrary.getByText('暂不可用', { exact: true }).count(), 1, 'failed media count is not presented as a genuine zero');
  assert.equal(await main.getByRole('alert').getByRole('button', { name: '重试读取', exact: true }).count(), 1, 'partial read failure exposes an explicit recovery action');
  await assertResponsiveLayout(page, 390, 844, 'light');

  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    const rect = element?.getBoundingClientRect();
    return {
      focusVisible: element?.matches(':focus-visible') ?? false,
      rendered: Boolean(rect && rect.width > 0 && rect.height > 0 && element?.getClientRects().length),
      outlineStyle: element ? getComputedStyle(element).outlineStyle : 'none',
      outlineWidth: element ? getComputedStyle(element).outlineWidth : '0px',
    };
  });
  assert.equal(focused.focusVisible, true, 'keyboard navigation reaches a focus-visible control');
  assert.equal(focused.rendered, true, 'the keyboard-focused control is visible');
  assert.ok(focused.outlineStyle !== 'none' || Number.parseFloat(focused.outlineWidth) > 0, 'the focused control has a visible outline');

  await main.getByRole('button', { name: '重试读取', exact: true }).click();
  await mediaLibrary.getByText('11', { exact: true }).waitFor();
  assert.equal(await main.getByRole('alert').count(), 0, 'the partial failure notice clears after the read recovers');
  assert.equal(resourceReads, 8, 'initial read and explicit retry each query four libraries, without any write request');
  assert.equal((await page.evaluate(async () => (await (await fetch('/__qa/state')).json()).resourceMutations)), 0, 'read recovery does not issue any resource mutation');
  assert.deepEqual(errors, [], 'the isolated partial-read recovery produces no unexpected browser errors');
  assert.equal(expectedFixtureErrors.length, 1, 'the only console error is the intentionally injected media-library 503');
  await assertResponsiveLayout(page, 390, 844, 'light');

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 780 }]) {
    await page.setViewportSize(viewport);
    for (const destination of destinations) {
      await destination.link.click();
      await page.waitForURL(`${base}${destination.path}`);
      await main.getByRole('heading', { name: destination.heading, exact: true }).waitFor();
      assert.equal(await page.getByRole('complementary').count(), 0, 'the route remains inside the mobile app shell');
      await page.getByRole('navigation', { name: '移动主导航', exact: true }).waitFor();
      await page.getByRole('banner').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
      const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(width.client, viewport.width, `${destination.heading} uses the requested mobile viewport`);
      assert.equal(width.scroll, width.client, `${destination.heading} has no mobile horizontal overflow at ${viewport.width}px`);
      await page.getByRole('button', { name: '返回资料中心', exact: true }).click();
      await page.waitForURL(`${base}/asset-center`);
      await main.getByRole('heading', { name: '资料中心', exact: true }).waitFor();
    }
  }

  await page.goto(`${base}/__qa?theme=dark`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  await mediaLibrary.getByText('11', { exact: true }).waitFor();
  await assertResponsiveLayout(page, 320, 780, 'dark');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/__qa?theme=light`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('main').getByRole('heading', { name: '资料中心', exact: true }).waitFor();
  await page.getByRole('complementary').waitFor();
  await mediaLibrary.getByText('11', { exact: true }).waitFor();
  await assertResponsiveLayout(page, 1440, 900, 'light');
  for (const [index, destination] of destinations.entries()) {
    await destination.link.click();
    await page.waitForURL(`${base}${destination.path}`);
    await page.getByRole('main').getByRole('heading', { name: destination.heading, exact: true }).waitFor();
    await assertSelectedSidebarItem(page, destination.sidebar);
    if (index < destinations.length - 1) {
      await page.getByRole('button', { name: '资料中心概览', exact: true }).click();
      await page.waitForURL(`${base}/asset-center`);
    }
  }
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
  const collapsedCurrentSection = page.getByRole('complementary').getByRole('navigation')
    .getByRole('button', { name: '资料与资产，当前视图：素材归档', exact: true });
  assert.equal(await collapsedCurrentSection.getAttribute('aria-expanded'), 'false', 'a collapsed sidebar announces the current page in its section control');
  await page.getByRole('button', { name: '展开侧边栏', exact: true }).click();
  await assertSelectedSidebarItem(page, '素材归档');
  assert.equal((await page.evaluate(async () => (await (await fetch('/__qa/state')).json()).resourceMutations)), 0, 'opening any library remains read-only');
  assert.deepEqual(errors, [], 'responsive and navigation checks produce no unexpected browser errors');
  console.log('Asset center test passed: partial reads recover explicitly, library cards remain responsive in light/dark themes, keyboard focus is visible, all four library routes return to the overview without overflow at 390/320px, and desktop navigation state matches every library without writes.');
} finally {
  // Keep fixture teardown independent: a browser launch failure must not leave Vite or the HTTP/Socket.IO server alive.
  const cleanupErrors: string[] = [];
  try { await browser?.close(); } catch (error) { cleanupErrors.push(`browser: ${String(error)}`); }
  try { await new Promise<void>((resolve) => io.close(() => resolve())); } catch (error) { cleanupErrors.push(`socket: ${String(error)}`); }
  if (server.listening) {
    try { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { cleanupErrors.push(`http: ${String(error)}`); }
  }
  try { await vite.close(); } catch (error) { cleanupErrors.push(`vite: ${String(error)}`); }
  if (cleanupErrors.length) console.error(`Fixture cleanup encountered errors: ${cleanupErrors.join('; ')}`);
}
