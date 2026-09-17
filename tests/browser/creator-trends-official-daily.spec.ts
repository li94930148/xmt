import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const screenshotDir = process.env.XMT_BROWSER_SCREENSHOT_DIR || '/tmp/xmt-v3.0.0-trends-browser';
const app = express();
const user = { id: 1, username: 'browser-admin', role: 'admin', name: '浏览器管理员', enabled: true, force_change_password: false };
app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get('/api/system-settings', (_request, response) => response.json({}));
app.get('/api/system-settings/public', (_request, response) => response.json({}));
app.use('/socket.io', (request, response) => request.method === 'GET'
  ? response.type('text/plain').send('0{"sid":"browser-socket","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}')
  : response.type('text/plain').send('ok'));
app.get('/api/creator-agent/douyin/trends', (request, response) => {
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
  console.log(`Creator official daily trends browser tests passed; screenshots: ${screenshotDir}`);
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
