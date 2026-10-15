import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 91, username: 'global-search-qa', role: 'admin', name: '全局搜索验收', enabled: true, force_change_password: false };
const requestedSearches: string[] = [];

function parseContrastColor(raw: string) {
  const match = raw.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const values = match[1].match(/[\d.]+/g)?.map(Number) || [];
  return values.length >= 3 ? { rgb: values.slice(0, 3), alpha: values[3] ?? 1 } : null;
}

function textContrastRatio(foreground: string, backgrounds: string[]) {
  const color = parseContrastColor(foreground)?.rgb;
  if (!color) return null;
  let background = [255, 255, 255];
  for (const raw of backgrounds) {
    const layer = parseContrastColor(raw);
    if (layer) background = background.map((value, index) => layer.rgb[index] * layer.alpha + value * (1 - layer.alpha));
  }
  const luminance = (rgb: number[]) => {
    const channels = rgb.map((value) => value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const textLuminance = luminance(color);
  const backgroundLuminance = luminance(background);
  return Number(((Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05)).toFixed(2));
}

async function assertPaletteResponsiveAndReadable(page: Page, viewportWidth: number, theme: 'light' | 'dark') {
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.xmt-overlay > div');
    if (!panel) return null;
    const panelRect = panel.getBoundingClientRect();
    const textNodes: Array<{ element: Element; text: string }> = [];
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && node.parentElement) textNodes.push({ element: node.parentElement, text });
    }
    const textSamples = textNodes.map(({ element, text }) => {
      const backgrounds: string[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) backgrounds.push(getComputedStyle(current).backgroundColor);
      return { text, foreground: getComputedStyle(element).color, backgrounds: backgrounds.reverse() };
    });
    const input = panel.querySelector('input');
    let placeholder: { foreground: string; backgrounds: string[] } | null = null;
    if (input) {
      const backgrounds: string[] = [];
      for (let current: Element | null = input; current; current = current.parentElement) backgrounds.push(getComputedStyle(current).backgroundColor);
      placeholder = { foreground: getComputedStyle(input, '::placeholder').color, backgrounds: backgrounds.reverse() };
    }
    const outsidePanel = [...panel.querySelectorAll<HTMLElement>('*')].map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { element, rect, style };
    }).filter(({ rect, style }) => rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
      && (rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1))
      .map(({ rect }) => ({ left: rect.left, right: rect.right }));
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panel: { left: panelRect.left, right: panelRect.right, width: panelRect.width, clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth },
      outsidePanel,
      textSamples,
      placeholder,
    };
  });

  assert.ok(metrics, `command palette is open at ${viewportWidth}px in ${theme} theme`);
  const belowContrast = metrics.textSamples.map((sample) => ({ text: sample.text, ratio: textContrastRatio(sample.foreground, sample.backgrounds) }))
    .filter((entry): entry is { text: string; ratio: number } => entry.ratio !== null && entry.ratio < 4.5);
  const placeholderRatio = metrics.placeholder ? textContrastRatio(metrics.placeholder.foreground, metrics.placeholder.backgrounds) : null;
  assert.equal(metrics.viewportWidth, viewportWidth);
  assert.ok(metrics.documentWidth <= viewportWidth, `document has no horizontal overflow: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.panel.left >= 0 && metrics.panel.right <= viewportWidth, `panel stays inside the viewport: ${JSON.stringify(metrics.panel)}`);
  assert.ok(metrics.panel.scrollWidth <= metrics.panel.clientWidth + 1, `panel content does not overflow horizontally: ${JSON.stringify(metrics.panel)}`);
  assert.deepEqual(metrics.outsidePanel, [], `palette descendants are not clipped by the panel: ${JSON.stringify(metrics.outsidePanel)}`);
  assert.deepEqual(belowContrast, [], `palette text meets 4.5:1 contrast in ${theme} theme: ${JSON.stringify(belowContrast)}`);
  assert.ok((placeholderRatio ?? 0) >= 4.5, `search placeholder meets 4.5:1 contrast in ${theme} theme: ${placeholderRatio}`);
}

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','global-search-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics');</script>`));
app.get('/__qa/searches', (_req, res) => res.json(requestedSearches));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/topics', (req, res) => {
  if (typeof req.query.search === 'string') {
    requestedSearches.push('topics');
    return res.json({ success: true, data: [{ id: 901, title: '选题样本 needle' }], pagination: { page: 1, limit: 8, total: 1 } });
  }
  return res.json({ data: [], total: 0, page: 1, limit: 20 });
});
app.get('/api/workflow/production', (req, res) => {
  if (typeof req.query.search === 'string') {
    requestedSearches.push('production');
    return res.json({ data: [{ id: 902, version: 'v3.0', status: 'draft', topic_title: '稿件 needle' }], total: 1, page: 1, limit: 8 });
  }
  return res.json([]);
});
app.get('/api/resource-center/search', (_req, res) => {
  requestedSearches.push('resources');
  return res.json({ data: [{ resource_id: 903, title: '资料 needle', library_type: 'knowledge', category: { name: '创作方法' } }], total: 1 });
});
app.get('/api/daily-reports/search', (_req, res) => {
  requestedSearches.push('dailyReports');
  return res.json({ success: true, data: { reports: [{ id: 904, reportDate: '2026-09-29', userId: 91, userName: '日报成员', summary: '日报 needle 内容' }] } });
});
app.get('/api/daily-reports/me', (_req, res) => res.json({ success: true, data: { reportDate: '2026-09-29', report: null, canCreate: true } }));
app.get('/api/daily-reports/archive', (req, res) => res.json({ success: true, data: { start: String(req.query.start || ''), end: String(req.query.end || ''), userId: 91, reports: [{ id: 904, userId: 91, userName: '日报成员', reportDate: '2026-09-29', status: 'submitted', manualSummaryMd: '日报 needle 内容', items: [] }] } }));
app.get('/api/retrospectives', (req, res) => {
  if (typeof req.query.keyword === 'string') {
    requestedSearches.push('retrospectives');
    return res.json({ success: true, data: { retrospectives: [{ id: 905, title: '复盘 needle', status: 'published' }] } });
  }
  return res.json({ success: true, data: { retrospectives: [] } });
});
app.get('/api/users', (req, res) => {
  if (typeof req.query.search === 'string') {
    requestedSearches.push('users');
    return res.json({ data: [{ id: 906, name: 'needle 用户', role: 'member' }], total: 1, page: 1, limit: 8 });
  }
  return res.json({ data: [user], total: 1, page: 1, limit: 20 });
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

if (process.env.XMT_GLOBAL_SEARCH_QA_SERVE === '1') {
  console.log(`Isolated global search QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const errors: string[] = [];
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '选题管理' }).waitFor();
  await page.keyboard.press('Meta+k');
  const search = page.getByRole('textbox', { name: '全局搜索' });
  await search.waitFor();
  await search.fill('n');
  await page.waitForTimeout(350);
  assert.deepEqual(await page.request.get(`${base}/__qa/searches`).then((response) => response.json()), [], 'a single character must not launch full text requests');
  await search.fill('needle');
  await page.getByRole('button', { name: /选题样本 needle/ }).waitFor();
  for (const label of ['稿件 needle', '资料 needle', '日报成员 · 2026-09-29', '复盘 needle', 'needle 用户']) {
    await page.getByRole('button', { name: new RegExp(label) }).waitFor();
  }
  assert.deepEqual((await page.request.get(`${base}/__qa/searches`).then((response) => response.json())).sort(), ['dailyReports', 'production', 'resources', 'retrospectives', 'topics', 'users'].sort());
  await page.getByRole('button', { name: /日报成员 · 2026-09-29/ }).click();
  await page.getByRole('heading', { name: '日报' }).waitFor();
  assert.match(page.url(), /daily-report\/summary\?date=2026-09-29&userId=91/);
  await page.getByText('日报成员', { exact: false }).waitFor();
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/xmt-global-search-daily-result.png', fullPage: true });
  await context.close();

  for (const theme of ['light', 'dark'] as const) {
    const narrowContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    await narrowContext.addInitScript((storedTheme) => localStorage.setItem('xmt_theme', storedTheme), theme);
    const narrowErrors: string[] = [];
    const narrowPage = await narrowContext.newPage();
    narrowPage.on('pageerror', (error) => narrowErrors.push(error.message));
    await narrowPage.goto(`${base}/__qa`);
    await narrowPage.getByRole('heading', { name: '选题管理' }).waitFor();
    await narrowPage.keyboard.press('Meta+k');
    const narrowSearch = narrowPage.getByRole('textbox', { name: '全局搜索' });
    await narrowSearch.waitFor();
    await narrowPage.setViewportSize({ width: 320, height: 812 });
    await assertPaletteResponsiveAndReadable(narrowPage, 320, theme);
    await narrowSearch.fill('needle');
    await narrowPage.getByRole('button', { name: /选题样本 needle/ }).waitFor();
    await assertPaletteResponsiveAndReadable(narrowPage, 320, theme);
    assert.deepEqual(narrowErrors, [], `command palette should render without browser errors in ${theme} theme`);
    await narrowContext.close();
  }

  console.log('Global search browser test passed: ⌘K, minimum query length, six source searches, accessible daily navigation, and 320px palette geometry/contrast in both themes.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
