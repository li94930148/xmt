import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Locator } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 96, username: 'messages-hover-qa', role: 'admin', name: '消息悬停验收', enabled: true, force_change_password: false };
const app = express();
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','messages-hover-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/messages');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get('/api/messages', (_req, res) => res.json({
  data: [], total: 0, page: 1, limit: 20,
  summary: { total: 0, unread: 0, actionable: 0 },
}));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
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

if (process.env.XMT_MESSAGES_HOVER_QA_SERVE === '1') {
  console.log(`Isolated message hover QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

async function renderedContrast(locator: Locator) {
  return locator.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const foreground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    const background = [255, 255, 255];
    for (const value of [getComputedStyle(document.documentElement).backgroundColor, ...ancestors.map((ancestor) => getComputedStyle(ancestor).backgroundColor)]) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const layer = Array.from(context.getImageData(0, 0, 1, 1).data);
      const alpha = layer[3] / 255;
      for (let index = 0; index < 3; index += 1) background[index] = layer[index] * alpha + background[index] * (1 - alpha);
    }
    const foregroundLuminance = foreground.reduce((sum, channel, index) => {
      const normalized = channel / 255;
      const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      return sum + [0.2126, 0.7152, 0.0722][index] * linear;
    }, 0);
    const backgroundLuminance = background.reduce((sum, channel, index) => {
      const normalized = channel / 255;
      const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      return sum + [0.2126, 0.7152, 0.0722][index] * linear;
    }, 0);
    return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  });
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  const mutations: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/') && request.method() !== 'GET' && request.method() !== 'HEAD') mutations.push(`${request.method()} ${pathname}`);
  });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '消息中心', exact: true }).waitFor();
    const clearAction = page.getByRole('button', { name: '清空', exact: true });
    assert.equal(await clearAction.getAttribute('data-reactbits-button'), 'danger', `${theme} clear action uses the shared danger button variant`);
    await page.mouse.move(0, 0);
    const backgroundBefore = await clearAction.evaluate((element) => getComputedStyle(element).backgroundColor);
    await clearAction.hover();
    const backgroundAfter = await clearAction.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(backgroundAfter, backgroundBefore, `${theme} clear action hover visibly changes its background`);
    assert.ok(await renderedContrast(clearAction) >= 4.5, `${theme} clear action text maintains at least 4.5:1 contrast`);
    assert.ok(await renderedContrast(clearAction.locator('svg')) >= 3, `${theme} clear action icon maintains at least 3:1 contrast`);

    await page.setViewportSize({ width: 320, height: 844 });
    const geometry = await clearAction.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, viewport: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth };
    });
    assert.ok(geometry.width > 0 && geometry.left >= 0 && geometry.right <= geometry.viewport + 1, `${theme} clear action remains visible at 320px: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.pageWidth <= geometry.viewport + 1, `${theme} messages page does not overflow horizontally at 320px`);
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  assert.deepEqual(mutations, [], 'hover verification must not submit or clear messages');
  assert.deepEqual(errors, [], 'message clear button hover renders without browser errors');
  console.log('Messages hover test passed: shared danger styling, contrast and 320px visibility in light/dark themes; no mutation requests.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
