import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Locator, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const admin = { id: 971, username: 'template-qa', role: 'admin', name: '模板页面验收', enabled: true, force_change_password: false };
type QaTemplate = { id: number; name: string; platform: string; description: string; template_data: string; creator_name: string };
let templates: QaTemplate[] = [{ id: 1, name: '通用工作选题', platform: '', description: '用于隔离验收', template_data: '背景：\n目标：\n', creator_name: '测试成员' }];
let nextId = 2;
let failTemplateReads = 0;
let templateCreateAttempts = 0;

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(admin))});localStorage.setItem('xmt_token','template-qa-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/templates');</script>`);
});
app.post('/__qa/fail-next-template-read', (_req, res) => { failTemplateReads += 1; res.json({ ok: true }); });
app.get('/api/auth/me', (_req, res) => res.json(admin));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({
  version,
  system: { defaultTheme: 'dark', browserTitle: '岚曜传媒协作管理系统' },
}));
app.get('/api/templates', (_req, res) => {
  if (failTemplateReads > 0) {
    failTemplateReads -= 1;
    return res.status(503).json({ message: '隔离夹具模拟列表读取失败' });
  }
  return res.json({ success: true, data: templates });
});
app.post('/api/templates', (req, res) => {
  templateCreateAttempts += 1;
  const created = { id: nextId++, ...req.body, creator_name: admin.name } as QaTemplate;
  templates = [...templates, created];
  res.status(201).json({ success: true, data: created });
});
app.put('/api/templates/:id', (req, res) => {
  templates = templates.map((template) => template.id === Number(req.params.id) ? { ...template, ...req.body } : template);
  res.json({ success: true });
});
app.delete('/api/templates/:id', (req, res) => {
  templates = templates.filter((template) => template.id !== Number(req.params.id));
  res.json({ success: true });
});
app.use('/api', (_req, res) => res.json({ success: true, data: {} }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const unexpectedErrors: string[] = [];

function rgb(raw: string) {
  const values = raw.match(/[\d.]+/g)?.map(Number) || [];
  if (values.length < 3) return null;
  return { values: values.slice(0, 3), alpha: values.length >= 4 ? values[3] : 1 };
}

function luminance(values: number[]) {
  const channels = values.map((value) => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

async function contrastRatio(locator: Locator) {
  const colors = await locator.evaluate((element) => {
    const layers: string[] = [];
    let opacity = 1;
    for (let node: HTMLElement | null = element as HTMLElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity || 1);
      layers.push(style.backgroundColor);
    }
    return { foreground: getComputedStyle(element).color, layers, opacity };
  });
  const foreground = rgb(colors.foreground);
  if (!foreground) return 0;
  let background = [255, 255, 255];
  for (const layer of colors.layers.reverse()) {
    const parsed = rgb(layer);
    if (parsed && parsed.alpha > 0) background = parsed.values.map((channel, index) => channel * parsed.alpha + background[index] * (1 - parsed.alpha));
  }
  const visibleForeground = foreground.values.map((channel, index) => channel * colors.opacity + background[index] * (1 - colors.opacity));
  const textLum = luminance(visibleForeground);
  const surfaceLum = luminance(background);
  return (Math.max(textLum, surfaceLum) + 0.05) / (Math.min(textLum, surfaceLum) + 0.05);
}

async function assertReadable(page: Page, label: string, locator: Locator) {
  await locator.waitFor({ state: 'visible' });
  const ratio = await contrastRatio(locator);
  assert.ok(ratio >= 4.5, `${label} contrast should be >= 4.5:1; got ${ratio.toFixed(2)}:1`);
}

function observeErrors(page: Page, expected503: { count: number }) {
  page.on('pageerror', (error) => unexpectedErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expected503.count > 0 && message.text().includes('503')) { expected503.count -= 1; return; }
    unexpectedErrors.push(message.text());
  });
}

async function assertPageReady(page: Page, viewportWidth: number) {
  assert.match(page.url(), /\/templates$/);
  assert.equal(await page.title(), '岚曜传媒协作管理系统');
  await page.getByRole('heading', { name: '选题模板', exact: true }).waitFor();
  await page.getByRole('heading', { name: '已有模板', exact: true }).waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0, 'there is no Vite error overlay');
  const widths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: window.innerWidth }));
  assert.equal(widths.viewport, viewportWidth);
  assert.ok(widths.document <= viewportWidth && widths.body <= viewportWidth, `page must not overflow horizontally: ${JSON.stringify(widths)}`);
}

try {
  const expected503 = { count: 0 };
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  observeErrors(desktop, expected503);
  await desktop.goto(`${base}/__qa?theme=dark`);
  await assertPageReady(desktop, 1440);
  await desktop.getByText('通用工作选题', { exact: true }).waitFor();
  await assertReadable(desktop, 'page title', desktop.getByRole('heading', { name: '选题模板', exact: true }));
  await assertReadable(desktop, 'page description', desktop.getByText('管理团队可复用的选题内容结构。', { exact: true }));
  await assertReadable(desktop, 'template metadata', desktop.getByText('通用 · 测试成员', { exact: true }));
  await desktop.screenshot({ path: '/tmp/xmt-template-management-1440-dark.png', fullPage: false });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  observeErrors(mobile, expected503);
  await mobile.goto(`${base}/__qa?theme=light`);
  await assertPageReady(mobile, 390);
  await assertReadable(mobile, 'form label', mobile.getByText('模板正文', { exact: true }));
  await assertReadable(mobile, 'template metadata', mobile.getByText('通用 · 测试成员', { exact: true }));

  const createName = '隔离浏览器新建模板';
  await mobile.getByLabel('名称').fill(createName);
  await mobile.getByLabel('平台').fill('视频号');
  await mobile.getByLabel('说明').fill('只写入本地夹具');
  await mobile.getByLabel('模板正文').fill('内容背景：\n传播目标：\n');
  await mobile.evaluate(async () => { await fetch('/__qa/fail-next-template-read', { method: 'POST' }); });
  expected503.count = 1;
  const failedRefresh = mobile.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'GET' && response.status() === 503);
  await mobile.getByRole('button', { name: '保存模板', exact: true }).dblclick({ delay: 10 });
  await failedRefresh;
  await mobile.getByRole('status').filter({ hasText: '服务端已确认模板保存，但列表刷新失败' }).waitFor();
  assert.equal(templateCreateAttempts, 1, 'rapid duplicate save click creates only one template');
  assert.equal(await mobile.getByLabel('名称').inputValue(), '', 'confirmed save closes and clears the form');
  await assertReadable(mobile, 'confirmed-save warning', mobile.getByRole('status').filter({ hasText: '服务端已确认模板保存，但列表刷新失败' }));
  await mobile.screenshot({ path: '/tmp/xmt-template-management-390-light-refresh-warning.png', fullPage: false });

  const retry = mobile.waitForResponse((response) => response.url().endsWith('/api/templates') && response.request().method() === 'GET' && response.status() === 200);
  await mobile.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await retry;
  await mobile.getByText(createName, { exact: true }).waitFor();
  await mobile.getByRole('status').filter({ hasText: '模板列表已重新加载' }).waitFor();
  assert.equal(templateCreateAttempts, 1, 'recovery performs only a GET and does not repeat the confirmed save');
  await mobile.screenshot({ path: '/tmp/xmt-template-management-390-light-recovered.png', fullPage: false });
  await mobile.close();

  const compact = await browser.newPage({ viewport: { width: 320, height: 740 }, reducedMotion: 'reduce' });
  observeErrors(compact, expected503);
  await compact.goto(`${base}/__qa?theme=dark`);
  await assertPageReady(compact, 320);
  await assertReadable(compact, 'compact template metadata', compact.getByText('通用 · 测试成员', { exact: true }));
  await compact.getByLabel('名称').waitFor();
  await compact.screenshot({ path: '/tmp/xmt-template-management-320-dark.png', fullPage: false });
  await compact.getByLabel('名称').fill('移动表单校验');
  const compactSave = compact.getByRole('button', { name: '保存模板', exact: true });
  await compactSave.scrollIntoViewIfNeeded();
  await compactSave.click();
  assert.equal(
    await compact.getByLabel('模板正文').evaluate((element) => element === document.activeElement),
    true,
    'the compact-page save action reaches the native required-field validation',
  );
  assert.equal(templateCreateAttempts, 1, 'compact validation does not write a partial template');

  assert.equal(expected503.count, 0, 'the single injected 503 is accounted for');
  assert.deepEqual(unexpectedErrors, [], 'no unexpected page, framework, or console errors');
  console.log('选题模板 320/390/1440px 亮暗主题、对比度、无溢出及保存后只读恢复回归通过');
} finally {
  await browser.close();
  io.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
}
