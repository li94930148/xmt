import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

const screenshotDir = process.env.XMT_BROWSER_SCREENSHOT_DIR || '/tmp/xmt-v2.22.0-browser';
const app = express();
app.use(express.json());

const user = { id: 1, username: 'browser-admin', email: 'admin@example.invalid', role: 'admin', name: '浏览器管理员', enabled: true, force_change_password: false, created_at: '2026-09-16T00:00:00.000Z', updated_at: '2026-09-16T00:00:00.000Z' };
let reports = [{
  id: 41,
  type: 'weekly',
  created_at: '2026-09-16T08:00:00.000Z',
  content: {
    report_version: 2,
    account_performance: { health: { score: 82.5 }, current: { play_count: 2_393_475, fans_count: 12_345 } },
    growth: { plays: 125_000, fans: 320, interactions: 4_200 },
    work_performance: { published: 5, total: 71, level_distribution: { viral: 2, excellent: 8, normal: 45, low: 16 } },
    data_coverage: { snapshot_count: 17, period_start: '2026-09-08', period_end: '2026-09-15', fans_available: true, metric_definition: '累计播放为去重后每个入库作品当前播放量之和；周期增长为账号日快照期末减期初。' },
    anomalies: [],
    excellent_works: [{ id: 1, title: '优秀作品', score: 91.2, play_count: 620_000 }],
    low_efficiency_works: [{ id: 2, title: '待优化作品', score: 30.5, play_count: 3_200 }],
    methodology: '账号、作品、趋势与报告统一读取抖音运营中心标准化数据。',
  },
}] as Array<Record<string, unknown>>;

app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get('/api/system-settings', (_request, response) => response.json({}));
app.get('/api/system-settings/public', (_request, response) => response.json({}));
app.use('/socket.io', (request, response) => {
  if (request.method === 'GET') return response.type('text/plain').send('0{"sid":"browser-socket","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
  return response.type('text/plain').send('ok');
});
app.get('/api/creator-agent/data', (_request, response) => response.json({ account: { account_id: 'douyin-browser-account', snapshot_time: '2026-09-16T08:00:00.000Z', source: 'creator-agent' }, works: [], dashboard: {}, fans: null, history: [], data_sources: ['douyin_operations_unified'], access_level: 'manage' }));
app.get('/api/creator-agent/reports', (_request, response) => response.json(reports));
app.delete('/api/creator-agent/reports/:id', (request, response) => { reports = reports.filter((report) => Number(report.id) !== Number(request.params.id)); response.sendStatus(204); });
app.get('/api/v1/auth-rollout/status', (_request, response) => response.json({
  success: true,
  data: {
    runtime: { effectiveConfigSource: 'runtime_env_file', effectiveAuthV1Enabled: false, effectiveAuthWebEnabled: false, effectiveLoginRolloutEnabled: false, effectiveRolloutMode: 'legacy', effectiveSocketBridgeEnabled: false, effectiveMobileAuthEnabled: false, mobileAuthApproved: false, mobileAllowlistCount: 0, effectiveMobileSocketEnabled: false, allowlistCount: 0, processId: 1, loadedAt: '2026-09-16T08:00:00.000Z' },
    rollout: { mode: 'legacy', enabled: false, percentage: 0, allowlistCount: 0, internalCount: 0 },
    socketBridge: { socketBridgeEnabled: false, socketBridgeApproval: false, socketV1EligibleUserCount: 0, currentMode: 'legacy' },
    diagnostic: { userId: 1, mode: 'legacy', enabled: false, matchedRule: 'none', reason: 'disabled' },
    metrics: { last5Minutes: metricWindow(5), lastHour: metricWindow(60), last24Hours: metricWindow(1440) },
    exporters: { source: ['memory', 'prometheus'], status: [{ name: 'memory', kind: 'memory', enabled: true, healthy: true, lastExportAt: '2026-09-16T08:00:00.000Z', reason: null }, { name: 'prometheus', kind: 'prometheus', enabled: true, healthy: true, lastExportAt: null, reason: '已有指标事件，但尚未收到 Prometheus 抓取' }], lastEventAt: '2026-09-16T08:00:00.000Z', lastExportAt: null },
    risk: { status: 'healthy', events: [] },
    thresholds: { windowMinutes: 60, refreshFailureRate: 0.05, csrfFailureCount: 5, tokenReuseCount: 1, expiredCount: 10 },
    audits: [],
    generatedAt: '2026-09-16T08:00:00.000Z',
  },
}));

function metricWindow(windowMinutes: number) {
  return { windowMinutes, from: '2026-09-16T07:00:00.000Z', to: '2026-09-16T08:00:00.000Z', categories: { login: 0, refresh: 0, logout: 0, failure: 0, securityEvents: 0 }, counters: { legacy_login_count: 0, v1_login_count: 0, refresh_success: 0, refresh_failed: 0, csrf_failed: 0, token_reuse_detected: 0, logout_success: 0, expired_count: 0 }, refreshFailureRate: 0 };
}

const server = http.createServer(app);
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);

await fs.mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function contextPage(viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ user }) => {
    localStorage.setItem('xmt_user', JSON.stringify(user));
    localStorage.setItem('xmt_token', 'browser-token');
    localStorage.setItem('xmt_last_version_seen', '2.22.0');
  }, { user });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, errors };
}

async function open(page: Page, pathname: string) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading').first().waitFor({ state: 'visible', timeout: 15_000 });
}

try {
  const desktop = await contextPage({ width: 1440, height: 1050 });
  await open(desktop.page, '/analytics/creator-center/reports');
  await desktop.page.getByText('当前累计播放', { exact: true }).waitFor();
  await desktop.page.getByText('239.3万', { exact: true }).waitFor();
  await desktop.page.getByText('数据完整度', { exact: true }).waitFor();
  assert.equal(await desktop.page.getByText('粉丝画像', { exact: true }).count(), 0, 'removed fan portrait entry must not remain in navigation');
  await desktop.page.screenshot({ path: path.join(screenshotDir, 'creator-reports-desktop.png'), fullPage: true });
  await desktop.page.getByRole('button', { name: '删除运营周报' }).click();
  await desktop.page.getByRole('button', { name: '删除报告', exact: true }).click();
  await desktop.page.getByText('尚未生成报告', { exact: true }).waitFor();
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const auth = await contextPage({ width: 1440, height: 1050 });
  await open(auth.page, '/admin/auth-rollout');
  await auth.page.getByText('已有指标事件，但尚未收到 Prometheus 抓取', { exact: true }).waitFor();
  await auth.page.getByText('Socket Bridge 尚未取得独立审批；先确定 2–3 个普通测试账号和回滚窗口。', { exact: true }).waitFor();
  await auth.page.screenshot({ path: path.join(screenshotDir, 'auth-readiness-desktop.png'), fullPage: true });
  assert.deepEqual(auth.errors, []);
  await auth.context.close();

  reports = [{ id: 42, type: 'weekly', created_at: '2026-09-16T08:00:00.000Z', content: { report_version: 2, account_performance: { health: { score: 82.5 }, current: { play_count: 2_393_475, fans_count: 12_345 } }, growth: { plays: 125_000, fans: 320, interactions: 4_200 }, work_performance: { published: 5, total: 71, level_distribution: { viral: 2, excellent: 8, normal: 45, low: 16 } }, data_coverage: { snapshot_count: 17, period_start: '2026-09-08', period_end: '2026-09-15', fans_available: true, metric_definition: '统一口径' }, anomalies: [], excellent_works: [], low_efficiency_works: [] } }];
  const mobile = await contextPage({ width: 390, height: 844 });
  await open(mobile.page, '/analytics/creator-center/reports');
  await mobile.page.getByText('当前累计播放', { exact: true }).waitFor();
  await mobile.page.screenshot({ path: path.join(screenshotDir, 'creator-reports-mobile.png'), fullPage: true });
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

  console.log(`Creator reports/Auth readiness browser tests passed; screenshots: ${screenshotDir}`);
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
