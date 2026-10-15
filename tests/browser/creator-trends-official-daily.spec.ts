import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright';
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
app.use('/socket.io', (request, response) => request.method === 'GET'
  ? response.type('text/plain').send('0{"sid":"browser-socket","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}')
  : response.type('text/plain').send('ok'));
app.get('/api/creator-agent/douyin/trends', (request, response) => {
  trendGetCount += 1;
  if (failNextTrendGet) {
    failNextTrendGet = false;
    return response.status(503).json({ message: '趋势数据暂时不可用' });
  }
  const period = request.query.period === '7d' ? '7d' : request.query.period === '90d' ? '90d' : '30d';
  response.json({
    period,
    snapshots: [
      { snapshot_date: '2026-09-15', fans_count: 100, works_count: 1, play_count: 100, like_count: 10, comment_count: 1, share_count: 1, interaction_count: 12, tracked_interaction_rate: .12 },
      { snapshot_date: '2026-09-16', fans_count: 105, works_count: 0, play_count: 200, like_count: 20, comment_count: 2, share_count: 3, interaction_count: 25, tracked_interaction_rate: .125 },
    ],
    source: 'creator_official_daily_metrics', metric_semantics: 'daily_flow', data_status: 'partial', snapshot_start_date: '2026-09-15', missing_fields: [],
    note: '播放、互动和投稿是官方导出的逐日流量，周期卡片按日求和。',
  });
});
app.post('/__test__/fail-next-trend-get', (_request, response) => {
  failNextTrendGet = true;
  response.sendStatus(204);
});
app.get('/__test__/trend-get-count', (_request, response) => response.json({ trendGetCount }));

const server = http.createServer(app);
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await fs.mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1050 }], ['mobile', { width: 390, height: 844 }]] as const) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(({ user }) => { localStorage.setItem('xmt_user', JSON.stringify(user)); localStorage.setItem('xmt_token', 'browser-token'); localStorage.setItem('xmt_last_version_seen', '3.0.0'); }, { user });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/analytics/creator-center/trends`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '数据趋势中心' }).waitFor();
    await page.getByText('播放、互动和投稿是官方导出的逐日流量，周期卡片按日求和。', { exact: false }).waitFor();
    assert.equal(await page.getByText('周期合计', { exact: true }).count(), 4);
    await page.getByRole('button', { name: '7 天' }).click();
    await page.getByText('300', { exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(screenshotDir, `creator-trends-${name}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  }

  failNextTrendGet = true;
  const recoveryContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await recoveryContext.addInitScript(({ user }) => { localStorage.setItem('xmt_user', JSON.stringify(user)); localStorage.setItem('xmt_token', 'browser-token'); localStorage.setItem('xmt_last_version_seen', '3.0.0'); }, { user });
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
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
