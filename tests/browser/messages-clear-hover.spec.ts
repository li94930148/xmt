import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Locator } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 96, username: 'messages-hover-qa', role: 'admin', name: '消息悬停验收', enabled: true, force_change_password: false };
let fixtureUnreadCount = 1;
const app = express();
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','messages-hover-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/messages');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: fixtureUnreadCount }));
app.get('/api/messages', (_req, res) => res.json({
  data: [{ id: 97, title: '未读状态主题验收', content: '仅用于检查未读标记随主题变化。', read: false, type: 'info', created_at: '2026-10-30T08:00:00.000Z' }], total: 1, page: 1, limit: 20,
  summary: { total: 1, unread: 1, actionable: 0 },
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
  const mobilePage = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  const mutations: string[] = [];
  for (const targetPage of [page, mobilePage]) {
    targetPage.on('pageerror', (error) => errors.push(error.message));
    targetPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    targetPage.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/api/') && request.method() !== 'GET' && request.method() !== 'HEAD') mutations.push(`${request.method()} ${pathname}`);
    });
  }

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '消息中心', exact: true }).waitFor();
    const desktopFilterGroup = page.getByRole('group', { name: '消息筛选', exact: true });
    assert.equal(await desktopFilterGroup.count(), 1, `${theme} desktop message filters expose a named group`);
    assert.equal(await desktopFilterGroup.getByRole('button').count(), 4, `${theme} desktop message filter group contains all four desktop filters`);
    assert.equal(await desktopFilterGroup.getByRole('button', { name: '全部', exact: true }).getAttribute('aria-pressed'), 'true', `${theme} desktop message filter group exposes the default selection`);
    assert.equal(await page.getByRole('heading', { name: '未读状态主题验收', level: 2 }).count(), 1, `${theme} message titles follow the page heading level`);
    const topbarMessagesButton = page.locator('header button[aria-label*="打开消息中心"]');
    const visibleUnreadCount = await topbarMessagesButton.locator('span').innerText();
    const messagesButtonName = await topbarMessagesButton.getAttribute('aria-label');
    assert.ok(messagesButtonName?.includes(visibleUnreadCount), `${theme} message button name includes its visible unread count`);
    const coralTokenChannels = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--xmt-coral-rgb').trim().split(/\s+/).map(Number));
    const badgeGlow = async (locator: Locator) => locator.evaluate((element) => {
      const boxShadow = getComputedStyle(element).boxShadow;
      const color = [...boxShadow.matchAll(/rgba?\(([^)]+)\)/g)].at(-1)?.[1];
      const channels = color?.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number) ?? [];
      return { className: element.className, channels, boxShadow };
    });
    const topbarBadgeGlow = await badgeGlow(topbarMessagesButton.locator('span'));
    const sidebarBadge = page.locator('aside button[title="消息中心"] span.relative > span.absolute');
    assert.equal(await sidebarBadge.count(), 1, `${theme} sidebar exposes the unread message badge`);
    const sidebarBadgeGlow = await badgeGlow(sidebarBadge);
    assert.ok(topbarBadgeGlow.className.includes('shadow-glow-coral'), `${theme} topbar badge uses the shared coral glow token`);
    assert.ok(sidebarBadgeGlow.className.includes('shadow-glow-coral'), `${theme} sidebar badge uses the shared coral glow token`);
    assert.deepEqual(topbarBadgeGlow.channels, coralTokenChannels, `${theme} topbar badge glow follows the Studio coral color: ${topbarBadgeGlow.boxShadow}`);
    assert.deepEqual(sidebarBadgeGlow.channels, coralTokenChannels, `${theme} sidebar badge glow follows the Studio coral color: ${sidebarBadgeGlow.boxShadow}`);
    assert.equal(topbarBadgeGlow.boxShadow, sidebarBadgeGlow.boxShadow, `${theme} topbar and sidebar badge glows match`);
    const unreadMessage = page.getByRole('button', { name: /未读状态主题验收/ });
    const unreadAccent = await unreadMessage.evaluate((element) => {
      const shadowColors = [...getComputedStyle(element).boxShadow.matchAll(/rgba?\(([^)]+)\)/g)];
      const shadowColor = shadowColors.at(-1)?.[1];
      const renderedChannels = shadowColor?.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number) ?? [];
      const tokenChannels = getComputedStyle(document.documentElement).getPropertyValue('--xmt-cyan-rgb').trim().split(/\s+/).map(Number);
      return { renderedChannels, tokenChannels, boxShadow: getComputedStyle(element).boxShadow };
    });
    assert.deepEqual(unreadAccent.renderedChannels, unreadAccent.tokenChannels, `${theme} unread accent follows the current Studio cyan token: ${unreadAccent.boxShadow}`);
    const countSummary = page.getByText(/^本页 \d+ 条，共 \d+ 条$/);
    assert.ok(await renderedContrast(countSummary) >= 4.5, `${theme} message count summary maintains at least 4.5:1 contrast`);
    const clearAction = page.getByRole('button', { name: '清空', exact: true });
    assert.equal(await clearAction.getAttribute('data-reactbits-button'), 'danger', `${theme} clear action uses the shared danger button variant`);
    await page.mouse.move(0, 0);
    const backgroundBefore = await clearAction.evaluate((element) => getComputedStyle(element).backgroundColor);
    await clearAction.hover();
    const backgroundAfter = await clearAction.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(backgroundAfter, backgroundBefore, `${theme} clear action hover visibly changes its background`);
    assert.ok(await renderedContrast(clearAction) >= 4.5, `${theme} clear action text maintains at least 4.5:1 contrast`);
    assert.ok(await renderedContrast(clearAction.locator('svg')) >= 3, `${theme} clear action icon maintains at least 3:1 contrast`);
    const geometry = await clearAction.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, viewport: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth };
    });
    assert.ok(geometry.width > 0 && geometry.left >= 0 && geometry.right <= geometry.viewport + 1, `${theme} clear action remains visible at 1440px: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.pageWidth <= geometry.viewport + 1, `${theme} desktop messages page does not overflow horizontally`);

    if (theme === 'dark') {
      await clearAction.click();
      await page.getByRole('dialog').getByRole('heading', { name: '确认清空消息' }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
      assert.equal(await page.getByRole('dialog').count(), 0, 'cancelling clear closes the confirmation without clearing messages');
    }

    await mobilePage.goto(`${base}/__qa?theme=${theme}`);
    await mobilePage.getByRole('heading', { name: '消息', exact: true }).waitFor();
    const mobileUnreadMessage = mobilePage.getByRole('button', { name: /未读状态主题验收/ });
    await mobileUnreadMessage.waitFor();
    const mobileFilterGroup = mobilePage.getByRole('group', { name: '消息筛选', exact: true });
    assert.equal(await mobileFilterGroup.count(), 1, `${theme} mobile message filters expose a named group`);
    assert.equal(await mobileFilterGroup.getByRole('button').count(), 5, `${theme} mobile message filter group contains all five mobile filters`);
    assert.equal(await mobileFilterGroup.getByRole('button', { name: '全部', exact: true }).getAttribute('aria-pressed'), 'true', `${theme} mobile message filter group exposes the default selection`);
    assert.equal(await mobilePage.getByRole('navigation', { name: '移动主导航' }).count(), 1, `${theme} 320px route uses the mobile message shell`);
    const mobileGeometry = await mobilePage.evaluate(() => ({ viewport: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth, mainWidth: document.querySelector('main')?.getBoundingClientRect().width ?? 0 }));
    assert.ok(mobileGeometry.pageWidth <= mobileGeometry.viewport + 1, `${theme} mobile messages page does not overflow horizontally: ${JSON.stringify(mobileGeometry)}`);
    assert.ok(mobileGeometry.mainWidth <= mobileGeometry.viewport, `${theme} mobile main content fits the viewport: ${JSON.stringify(mobileGeometry)}`);
  }

  fixtureUnreadCount = 12;
  await page.goto(`${base}/__qa?theme=light`);
  await page.getByRole('heading', { name: '消息中心', exact: true }).waitFor();
  const manyUnreadMessagesButton = page.locator('header button[aria-label*="打开消息中心"]');
  assert.equal(await manyUnreadMessagesButton.locator('span').innerText(), '9+', 'topbar badge caps visible unread counts above nine');
  assert.equal(await manyUnreadMessagesButton.getAttribute('aria-label'), '打开消息中心，未读 9+ 条，共 12 条', 'topbar accessible name includes both the visible capped badge and exact unread total');

  assert.deepEqual(mutations, [], 'hover verification must not submit or clear messages');
  assert.deepEqual(errors, [], 'message clear button hover renders without browser errors');
  console.log('Messages test passed: desktop count and clear-action contrast, clear confirmation cancel, and 320px mobile shell in light/dark themes; no mutation requests.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
