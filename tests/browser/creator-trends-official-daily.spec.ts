import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';

const screenshotDir = process.env.XMT_BROWSER_SCREENSHOT_DIR || '/tmp/xmt-v3.0.0-trends-browser';
const app = express();
let failNextTrendGet = false;
let trendGetCount = 0;
const user = { id: 1, username: 'browser-admin', role: 'admin', name: '浏览器管理员', enabled: true, force_change_password: false };
app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get('/api/system-settings', (_request, response) => response.json({}));
app.get('/api/system-settings/public', (_request, response) => response.json({}));
app.get('/api/creator-agent/douyin/trends', (request, response) => {
  trendGetCount += 1;
  if (failNextTrendGet) {
    failNextTrendGet = false;
    return response.status(503).json({ message: '趋势数据暂时不可用' });
  }
  const period = request.query.period === '7d' ? '7d' : request.query.period === '90d' ? '90d' : '30d';
  response.json({
    period,
    snapshots: period === '90d' ? [] : [
      { snapshot_date: '2026-09-15', fans_count: 100, works_count: 1, play_count: 100, like_count: 10, comment_count: 1, share_count: 1, interaction_count: 12, tracked_interaction_rate: .12 },
      { snapshot_date: '2026-09-16', fans_count: 105, works_count: 0, play_count: 200, like_count: 20, comment_count: 2, share_count: 3, interaction_count: 25, tracked_interaction_rate: .125 },
    ],
    source: 'creator_official_daily_metrics', metric_semantics: 'daily_flow', data_status: 'partial', snapshot_start_date: period === '90d' ? null : '2026-09-15', missing_fields: period === '90d' ? ['period_daily_metrics'] : [],
    note: period === '90d' ? '近 90 天官方逐日数据不完整。' : '播放、互动和投稿是官方导出的逐日流量，周期卡片按日求和。',
  });
});
app.post('/__test__/fail-next-trend-get', (_request, response) => {
  failNextTrendGet = true;
  response.sendStatus(204);
});
app.get('/__test__/trend-get-count', (_request, response) => response.json({ trendGetCount }));

function parseCssColor(value: string) {
  const channels = value.match(/[0-9.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 } : null;
}

function luminance(rgb: number[]) {
  const linear = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function contrastRatio(element: import('playwright').Locator) {
  const styles = await element.evaluate(node => {
    const ancestors: Element[] = [];
    for (let current: Element | null = node; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    return {
      foreground: getComputedStyle(node).color,
      backgrounds: [getComputedStyle(document.documentElement).backgroundColor, ...ancestors.map(ancestor => getComputedStyle(ancestor).backgroundColor)],
    };
  });
  const foreground = parseCssColor(styles.foreground)?.rgb;
  if (!foreground) return 0;
  let background = [255, 255, 255];
  for (const value of styles.backgrounds) {
    const layer = parseCssColor(value);
    if (layer) background = layer.rgb.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
  }
  const text = luminance(foreground);
  const surface = luminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}

async function assertTrendCopyContrast(page: import('playwright').Page, theme: 'light' | 'dark') {
  const candidates = page.locator('main [class~="text-studio-text-muted"], main [class~="text-studio-text-secondary"]');
  let checked = 0;
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.textContent() || '').trim() || !(await candidate.isVisible())) continue;
    const ratio = await contrastRatio(candidate);
    assert.ok(ratio >= 4.5, `${theme}主题趋势说明“${(await candidate.textContent() || '').trim().slice(0, 40)}”对比度为 ${ratio.toFixed(2)}:1，应不低于 4.5:1`);
    checked += 1;
  }
  assert.ok(checked >= 8, `${theme}主题趋势页至少应检查 8 项普通说明，实际检查 ${checked} 项`);
}

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
const fixturePort = Number(process.env.XMT_BROWSER_MCP_PORT) || 0;
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(fixturePort, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
if (process.argv.includes('--mcp-fixture')) {
  console.log(`Creator trends MCP fixture ready: http://127.0.0.1:${address.port}`);
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await vite.close();
  await new Promise<void>(resolve => io.close(() => resolve()));
} else {
await fs.mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1050 }], ['mobile', { width: 390, height: 844 }], ['narrow', { width: 320, height: 740 }]] as const) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(({ user }) => { localStorage.setItem('xmt_user', JSON.stringify(user)); localStorage.setItem('xmt_token', 'browser-token'); localStorage.setItem('xmt_theme', 'dark'); localStorage.setItem('xmt_last_version_seen', '3.0.0'); }, { user });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/analytics/creator-center/trends`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '数据趋势中心' }).waitFor();
    await page.getByText('播放、互动和投稿是官方导出的逐日流量，周期卡片按日求和。', { exact: false }).waitFor();
    await assertTrendCopyContrast(page, 'dark');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}暗色趋势页无横向溢出`);
    assert.equal(await page.getByText('周期合计', { exact: true }).count(), 4);
    await page.getByRole('button', { name: '7 天' }).click();
    await page.getByText('300', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: '90 天' }).click();
    await page.getByRole('status').getByText('缺失日期不会按 0 计入。').waitFor();
    await assertTrendCopyContrast(page, 'dark');
    assert.equal(await page.getByText('周期合计', { exact: true }).count(), 0, 'an incomplete 90-day response must not render totals or charts');
    await page.screenshot({ path: path.join(screenshotDir, `creator-trends-${name}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  }

  const lightContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await lightContext.addInitScript(({ user }) => { localStorage.setItem('xmt_user', JSON.stringify(user)); localStorage.setItem('xmt_token', 'browser-token'); localStorage.setItem('xmt_theme', 'light'); localStorage.setItem('xmt_last_version_seen', '3.0.0'); }, { user });
  const lightPage = await lightContext.newPage();
  await lightPage.goto(`http://127.0.0.1:${address.port}/analytics/creator-center/trends`, { waitUntil: 'domcontentloaded' });
  await lightPage.getByRole('heading', { name: '数据趋势中心' }).waitFor();
  await lightPage.getByText('播放、互动和投稿是官方导出的逐日流量，周期卡片按日求和。', { exact: false }).waitFor();
  await assertTrendCopyContrast(lightPage, 'light');
  assert.ok(await lightPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '390px 亮色趋势页无横向溢出');
  await lightContext.close();

  failNextTrendGet = true;
  const recoveryContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await recoveryContext.addInitScript(({ user }) => { localStorage.setItem('xmt_user', JSON.stringify(user)); localStorage.setItem('xmt_token', 'browser-token'); localStorage.setItem('xmt_theme', 'dark'); localStorage.setItem('xmt_last_version_seen', '3.0.0'); }, { user });
  const recoveryPage = await recoveryContext.newPage();
  const recoveryErrors: string[] = [];
  recoveryPage.on('console', message => { if (message.type() === 'error') recoveryErrors.push(message.text()); });
  recoveryPage.on('pageerror', error => recoveryErrors.push(error.message));
  await recoveryPage.goto(`http://127.0.0.1:${address.port}/analytics/creator-center/trends`, { waitUntil: 'domcontentloaded' });
  await recoveryPage.getByRole('heading', { name: '数据趋势中心' }).waitFor();
  await recoveryPage.getByText('趋势数据暂不可用').waitFor();
  assert.equal(await recoveryPage.getByText('周期合计', { exact: true }).count(), 0, '首次读取失败时不得伪装成空趋势或展示旧周期数据');
  assert.match(await recoveryPage.getByRole('alert').innerText(), /当前周期的数据暂时无法读取.*趋势数据暂时不可用/);
  const beforeRetry = await recoveryPage.evaluate(async () => (await fetch('/__test__/trend-get-count')).json() as Promise<{ trendGetCount: number }>);
  await recoveryPage.getByRole('button', { name: '重新读取' }).click();
  await recoveryPage.getByText('播放、互动和投稿是官方导出的逐日流量，周期卡片按日求和。', { exact: false }).waitFor();
  assert.equal(await recoveryPage.getByText('周期合计', { exact: true }).count(), 4, '只读重试应恢复当前周期指标');
  assert.equal((await recoveryPage.evaluate(async () => (await fetch('/__test__/trend-get-count')).json() as Promise<{ trendGetCount: number }>)).trendGetCount, beforeRetry.trendGetCount + 1, '恢复只发起一次趋势 GET');

  await recoveryPage.evaluate(async () => { await fetch('/__test__/fail-next-trend-get', { method: 'POST' }); });
  await recoveryPage.getByRole('button', { name: '重新读取' }).click();
  await recoveryPage.getByRole('alert').waitFor();
  assert.equal(await recoveryPage.getByText('周期合计', { exact: true }).count(), 4, '刷新失败时应保留同一周期最近一次成功的图表');
  assert.match(await recoveryPage.getByRole('alert').innerText(), /仍保留该周期最近一次成功读取的数据.*趋势数据暂时不可用/);
  await recoveryPage.getByRole('button', { name: '重新读取' }).click();
  await recoveryPage.getByRole('alert').waitFor({ state: 'detached' });
  assert.equal(await recoveryPage.getByText('周期合计', { exact: true }).count(), 4, '失败后显式只读重试恢复成功');
  await recoveryPage.evaluate(async () => { await fetch('/__test__/fail-next-trend-get', { method: 'POST' }); });
  await recoveryPage.getByRole('button', { name: '7 天' }).click();
  await recoveryPage.getByRole('alert').waitFor();
  assert.equal(await recoveryPage.getByText('周期合计', { exact: true }).count(), 0, '切换周期读取失败时不得继续展示上一周期的图表');
  assert.match(await recoveryPage.getByRole('alert').innerText(), /当前周期的数据暂时无法读取.*趋势数据暂时不可用/);
  await recoveryPage.getByRole('button', { name: '重新读取' }).click();
  await recoveryPage.getByRole('alert').waitFor({ state: 'detached' });
  await recoveryPage.getByText('周期合计', { exact: true }).first().waitFor();
  assert.equal(await recoveryPage.getByRole('button', { name: '7 天' }).getAttribute('aria-pressed'), 'true');
  assert.equal(await recoveryPage.getByText('周期合计', { exact: true }).count(), 4, '切换周期失败后重试应显示所选周期的数据');
  assert.equal(recoveryErrors.length, 3, '控制台仅记录三次测试主动注入的 HTTP 503');
  assert.ok(recoveryErrors.every(error => error.includes('503 (Service Unavailable)')));
  await recoveryContext.close();
  console.log(`Creator official daily trends browser tests passed; screenshots: ${screenshotDir}`);
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>(resolve => io.close(() => resolve()));
}
}
