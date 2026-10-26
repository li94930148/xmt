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
let failNextReportListGet = false;
let delayNextReportListGetMs = 0;
let reportListGetCount = 0;
let creatorCenterDataGetCount = 0;
let reportGenerateCount = 0;
let reportDeleteCount = 0;
let loseNextReportGenerateResponseAfterCommit = false;
let loseNextReportDeleteResponseAfterCommit = false;
let nextReportId = 100;
let authRiskFixture: { status: 'healthy' | 'risk'; events: Array<{ code: string; severity: 'warning' | 'critical'; value: number; threshold: number; reason: string; createdAt: string }> } = { status: 'healthy', events: [] };

app.get('/api/auth/me', (_request, response) => response.json(user));
app.get('/api/permissions/my', (_request, response) => response.json(['analytics:view']));
app.get('/api/messages/unread', (_request, response) => response.json({ unreadCount: 0 }));
app.get('/api/system-settings', (_request, response) => response.json({}));
app.get('/api/system-settings/public', (_request, response) => response.json({}));
app.get('/api/analytics/team', (_request, response) => response.json({ month: 9, year: 2026, completed_count: 4, total_count: 8, overdue_count: 1, completion_rate: '50', overdue_rate: '12.5', avg_days: '3' }));
app.get('/api/analytics/monthly', (_request, response) => response.json({ month: 9, year: 2026, total_views: 1200, total_likes: 80, total_shares: 12, total_comments: 9, topic_count: 3, publication_count: 2 }));
app.get('/api/analytics/user', (_request, response) => response.json([
  { user_id: 1, user_name: '排行第一', topic_count: 8, total_views: 12000, total_likes: 800 },
  { user_id: 2, user_name: '排行第二', topic_count: 6, total_views: 9000, total_likes: 600 },
  { user_id: 3, user_name: '排行第三', topic_count: 4, total_views: 6000, total_likes: 400 },
]));
app.get('/api/topics', (_request, response) => response.json({ data: [], total: 0, page: 1, limit: 20 }));
app.use('/socket.io', (request, response) => {
  if (request.method === 'GET') return response.type('text/plain').send('0{"sid":"browser-socket","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
  return response.type('text/plain').send('ok');
});
app.get('/api/creator-agent/data', (_request, response) => {
  creatorCenterDataGetCount += 1;
  return response.json({ account: { account_id: 'douyin-browser-account', snapshot_time: '2026-09-16T08:00:00.000Z', source: 'creator-agent' }, works: [], dashboard: {}, fans: null, history: [], data_sources: ['douyin_operations_unified'], access_level: 'manage' });
});
app.get('/api/creator-agent/reports', (_request, response) => {
  reportListGetCount += 1;
  if (failNextReportListGet) {
    failNextReportListGet = false;
    return response.status(503).json({ message: '报告列表暂时不可用' });
  }
  const snapshot = [...reports];
  const delayMs = delayNextReportListGetMs;
  delayNextReportListGetMs = 0;
  if (delayMs > 0) {
    return setTimeout(() => response.json(snapshot), delayMs);
  }
  return response.json(snapshot);
});
app.post('/api/creator-agent/reports/generate', (request, response) => {
  reportGenerateCount += 1;
  const report = { id: nextReportId++, type: request.body.type, created_at: '2026-09-16T09:00:00.000Z', content: { report_version: 1, account_performance: {}, growth: {}, work_performance: {}, anomalies: [] } };
  reports = [report, ...reports];
  if (loseNextReportGenerateResponseAfterCommit) {
    loseNextReportGenerateResponseAfterCommit = false;
    return response.status(503).json({ message: '生成结果暂无法确认' });
  }
  response.status(201).json(report);
});
app.delete('/api/creator-agent/reports/:id', (request, response) => {
  reportDeleteCount += 1;
  reports = reports.filter((report) => Number(report.id) !== Number(request.params.id));
  if (loseNextReportDeleteResponseAfterCommit) {
    loseNextReportDeleteResponseAfterCommit = false;
    return response.status(503).json({ message: '删除结果暂无法确认' });
  }
  response.sendStatus(204);
});
app.post('/__test__/fail-next-report-list-get', (_request, response) => {
  failNextReportListGet = true;
  response.sendStatus(204);
});
app.post('/__test__/lose-next-report-generate-response', (_request, response) => {
  loseNextReportGenerateResponseAfterCommit = true;
  response.sendStatus(204);
});
app.post('/__test__/lose-next-report-delete-response', (_request, response) => {
  loseNextReportDeleteResponseAfterCommit = true;
  response.sendStatus(204);
});
app.post('/__test__/delay-next-report-list-get', (request, response) => {
  delayNextReportListGetMs = Math.max(0, Math.min(2_000, Number(request.body.delayMs) || 0));
  response.sendStatus(204);
});
app.post('/__test__/auth-risk', (_request, response) => {
  authRiskFixture = { status: 'risk', events: [{ code: 'TOKEN_REUSE', severity: 'critical', value: 2, threshold: 1, reason: 'Token reuse 次数超过停止阈值', createdAt: '2026-09-16T08:00:00.000Z' }] };
  response.sendStatus(204);
});
app.get('/__test__/report-mutation-counts', (_request, response) => response.json({ reportGenerateCount, reportDeleteCount, reportListGetCount }));
app.get('/api/v1/auth-rollout/status', (_request, response) => response.json({
  success: true,
  data: {
    runtime: { effectiveConfigSource: 'runtime_env_file', effectiveAuthV1Enabled: false, effectiveAuthWebEnabled: false, effectiveLoginRolloutEnabled: false, effectiveRolloutMode: 'legacy', effectiveSocketBridgeEnabled: false, effectiveMobileAuthEnabled: false, mobileAuthApproved: false, mobileAllowlistCount: 0, effectiveMobileSocketEnabled: false, allowlistCount: 0, processId: 1, loadedAt: '2026-09-16T08:00:00.000Z' },
    rollout: { mode: 'legacy', enabled: false, percentage: 0, allowlistCount: 0, internalCount: 0 },
    socketBridge: { socketBridgeEnabled: false, socketBridgeApproval: false, socketV1EligibleUserCount: 0, currentMode: 'legacy' },
    diagnostic: { userId: 1, mode: 'legacy', enabled: false, matchedRule: 'none', reason: 'disabled' },
    metrics: { last5Minutes: metricWindow(5), lastHour: metricWindow(60), last24Hours: metricWindow(1440) },
    exporters: { source: ['memory', 'prometheus'], status: [{ name: 'memory', kind: 'memory', enabled: true, healthy: true, lastExportAt: '2026-09-16T08:00:00.000Z', reason: null }, { name: 'prometheus', kind: 'prometheus', enabled: true, healthy: true, lastExportAt: null, reason: '已有指标事件，但尚未收到 Prometheus 抓取' }], lastEventAt: '2026-09-16T08:00:00.000Z', lastExportAt: null },
    risk: authRiskFixture,
    thresholds: { windowMinutes: 60, refreshFailureRate: 0.05, csrfFailureCount: 5, tokenReuseCount: 1, expiredCount: 10 },
    audits: [],
    generatedAt: '2026-09-16T08:00:00.000Z',
  },
}));

function metricWindow(windowMinutes: number) {
  return { windowMinutes, from: '2026-09-16T07:00:00.000Z', to: '2026-09-16T08:00:00.000Z', categories: { login: 0, refresh: 0, logout: 0, failure: 0, securityEvents: 0 }, counters: { legacy_login_count: 0, v1_login_count: 0, refresh_success: 0, refresh_failed: 0, csrf_failed: 0, token_reuse_detected: 0, logout_success: 0, expired_count: 0 }, refreshFailureRate: 0 };
}

const server = http.createServer(app);
const inspectionPort = Number(process.env.XMT_BROWSER_MCP_PORT) || 0;
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(inspectionPort, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);

if (process.argv.includes('--mcp-fixture')) {
  console.log(`Creator reports MCP fixture ready: ${baseUrl}`);
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
} else {
await fs.mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function contextPage(viewport: { width: number; height: number }, theme: 'light' | 'dark' = 'dark') {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ user, theme }) => {
    localStorage.setItem('xmt_user', JSON.stringify(user));
    localStorage.setItem('xmt_token', 'browser-token');
    localStorage.setItem('xmt_theme', theme);
    localStorage.setItem('xmt_last_version_seen', '2.22.0');
  }, { user, theme });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, errors };
}

function parseCssColor(value: string) {
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 } : null;
}

function luminance(rgb: number[]) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function contrastRatio(locator: ReturnType<Page['getByText']>) {
  const styles = await locator.evaluate((element) => {
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    const backgrounds = [getComputedStyle(document.documentElement).backgroundColor];
    for (const ancestor of ancestors) backgrounds.push(getComputedStyle(ancestor).backgroundColor);
    return { foreground: getComputedStyle(element).color, backgrounds };
  });
  const foreground = parseCssColor(styles.foreground)?.rgb;
  if (!foreground) return 0;
  let background = [255, 255, 255];
  for (const value of styles.backgrounds) {
    const layer = parseCssColor(value);
    if (!layer) continue;
    background = layer.rgb.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
  }
  const text = luminance(foreground);
  const surface = luminance(background);
  return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
}

async function assertCreatorReportCopyContrast(page: Page, theme: 'light' | 'dark') {
  const candidates = page.locator('main [class~="text-studio-text-muted"], main [class~="text-studio-text-secondary"]');
  let checked = 0;
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    const text = (await candidate.textContent() || '').trim();
    if (!text || !(await candidate.isVisible())) continue;
    const ratio = await contrastRatio(candidate);
    assert.ok(ratio >= 4.5, `${theme}主题普通报告文案“${text.slice(0, 40)}”对比度为 ${ratio.toFixed(2)}:1，应不低于 4.5:1`);
    checked += 1;
  }
  assert.ok(checked >= 10, `${theme}主题至少应检查 10 个报告说明/标签，实际检查 ${checked} 个`);
}

async function open(page: Page, pathname: string) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading').first().waitFor({ state: 'visible', timeout: 15_000 });
}

function assertOnlyInjectedRefreshFailure(errors: string[], operation: string) {
  assert.equal(errors.length, 1, `${operation}场景仅应出现夹具注入的刷新失败`);
  assert.match(errors[0], /503 \(Service Unavailable\)/, `${operation}场景浏览器错误应来自预期的 HTTP 503`);
}

try {
  for (const theme of ['light', 'dark'] as const) {
    const analytics = await contextPage({ width: 1440, height: 1050 }, theme);
    await open(analytics.page, '/analytics');
    await analytics.page.getByRole('heading', { name: '个人统计排行', exact: true }).waitFor();
    for (const index of [0, 1, 2]) {
      const rank = analytics.page.locator('table tbody tr').nth(index).locator('td').first().locator('span');
      await rank.waitFor();
      const ratio = await contrastRatio(rank);
      assert.ok(ratio >= 4.5, `${theme}主题排行榜第${index + 1}名徽标文字对比度为 ${ratio.toFixed(2)}:1，应不低于 4.5:1`);
    }
    assert.deepEqual(analytics.errors, [], `${theme}主题排行榜无浏览器错误`);
    await analytics.context.close();
  }

  const desktop = await contextPage({ width: 1440, height: 1050 });
  await open(desktop.page, '/analytics/creator-center/reports');
  await desktop.page.getByText('当前累计播放', { exact: true }).waitFor();
  await desktop.page.getByText('239.3万', { exact: true }).waitFor();
  await desktop.page.getByText('数据完整度', { exact: true }).waitFor();
  await assertCreatorReportCopyContrast(desktop.page, 'dark');
  assert.equal(await desktop.page.getByText('粉丝画像', { exact: true }).count(), 0, 'removed fan portrait entry must not remain in navigation');
  await desktop.page.screenshot({ path: path.join(screenshotDir, 'creator-reports-desktop.png'), fullPage: true });
  await desktop.page.getByRole('button', { name: '删除运营周报' }).click();
  await desktop.page.getByRole('button', { name: '删除报告', exact: true }).click();
  await desktop.page.getByText('尚未生成报告', { exact: true }).waitFor();
  assert.deepEqual(desktop.errors, []);
  await desktop.context.close();

  const auth = await contextPage({ width: 1440, height: 1050 });
  await open(auth.page, '/admin/auth-rollout');
  await auth.page.getByRole('heading', { name: '暂不扩大新版登录试用范围', exact: true }).waitFor();
  const darkSearchShortcut = auth.page.locator('kbd').filter({ hasText: 'Ctrl K' });
  const darkSearchShortcutContrast = await contrastRatio(darkSearchShortcut);
  assert.ok(darkSearchShortcutContrast >= 4.5, `dark theme global search shortcut contrast is ${darkSearchShortcutContrast.toFixed(2)}:1; expected at least 4.5:1`);
  await auth.page.getByText('监控系统还没有确认收到新数据。请先确认监控看板有最新记录。', { exact: true }).waitFor();
  await auth.page.getByText('实时协作尚未完成单独审批。开始小范围试用前，请先确定 2–3 个内部测试账号和回退安排。', { exact: true }).waitFor();
  assert.equal(await auth.page.getByText('已有指标事件，但尚未收到 Prometheus 抓取', { exact: true }).count(), 0, 'monitor implementation reason is not shown as customer-facing copy');
  assert.equal(await auth.page.getByText('Socket Bridge 尚未取得独立审批；先确定 2–3 个普通测试账号和回滚窗口。', { exact: true }).count(), 0, 'socket implementation term is not shown as customer-facing copy');
  assert.equal(await auth.page.locator('details').evaluate((element) => (element as HTMLDetailsElement).open), false, 'administrator diagnostics stay collapsed by default');
  await auth.page.screenshot({ path: path.join(screenshotDir, 'auth-readiness-desktop.png'), fullPage: true });
  await auth.page.request.post(`${baseUrl}/__test__/auth-risk`);
  await auth.page.getByRole('button', { name: '重新检查', exact: true }).click();
  await auth.page.getByText('检测到重复使用的登录凭证。建议立即暂停扩大试用并处理相关账号。', { exact: true }).waitFor();
  assert.doesNotMatch(await auth.page.locator('body').innerText(), /Token reuse 次数超过停止阈值/, 'raw risk reason is not shown before administrator diagnostics are expanded');
  await auth.page.locator('details summary').click();
  await auth.page.getByText('Token reuse 次数超过停止阈值', { exact: false }).waitFor();
  await auth.page.getByText('TOKEN_REUSE', { exact: true }).waitFor();
  await auth.page.getByText('部署配置文件', { exact: true }).waitFor();
  await auth.page.getByText('Prometheus 外部监控', { exact: false }).waitFor();
  await auth.page.getByText('Token reuse 次数超过停止阈值', { exact: false }).scrollIntoViewIfNeeded();
  await auth.page.screenshot({ path: path.join(screenshotDir, 'auth-readiness-risk-admin-details.png') });
  assert.deepEqual(auth.errors, []);
  await auth.context.close();

  const lightAuth = await contextPage({ width: 1440, height: 1050 }, 'light');
  await open(lightAuth.page, '/admin/auth-rollout');
  const lightSearchShortcut = lightAuth.page.locator('kbd').filter({ hasText: 'Ctrl K' });
  const lightSearchShortcutContrast = await contrastRatio(lightSearchShortcut);
  assert.ok(lightSearchShortcutContrast >= 4.5, `light theme global search shortcut contrast is ${lightSearchShortcutContrast.toFixed(2)}:1; expected at least 4.5:1`);
  await lightAuth.context.close();

  reports = [{ id: 42, type: 'weekly', created_at: '2026-09-16T08:00:00.000Z', content: { report_version: 2, account_performance: { health: { score: 82.5 }, current: { play_count: 2_393_475, fans_count: 12_345 } }, growth: { plays: 125_000, fans: 320, interactions: 4_200 }, work_performance: { published: 5, total: 71, level_distribution: { viral: 2, excellent: 8, normal: 45, low: 16 } }, data_coverage: { snapshot_count: 17, period_start: '2026-09-08', period_end: '2026-09-15', fans_available: true, metric_definition: '统一口径' }, anomalies: [], excellent_works: [], low_efficiency_works: [] } }];
  const mobile = await contextPage({ width: 390, height: 844 });
  await open(mobile.page, '/analytics/creator-center/reports');
  await mobile.page.getByText('当前累计播放', { exact: true }).waitFor();
  await assertCreatorReportCopyContrast(mobile.page, 'dark');
  assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '390px 报告页无横向溢出');
  await mobile.page.screenshot({ path: path.join(screenshotDir, 'creator-reports-mobile.png'), fullPage: true });
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

  const narrowDark = await contextPage({ width: 320, height: 740 }, 'dark');
  await open(narrowDark.page, '/analytics/creator-center/reports');
  await narrowDark.page.getByText('当前累计播放', { exact: true }).waitFor();
  await assertCreatorReportCopyContrast(narrowDark.page, 'dark');
  assert.ok(await narrowDark.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '320px 暗色报告页无横向溢出');
  assert.deepEqual(narrowDark.errors, []);
  await narrowDark.context.close();

  for (const width of [320, 390, 1440]) {
    for (const theme of ['light', 'dark'] as const) {
      const targetPage = await contextPage({ width, height: width === 1440 ? 1050 : 844 }, theme);
      await open(targetPage.page, '/analytics/creator-center/reports');
      const deleteButton = targetPage.page.getByRole('button', { name: '删除运营周报', exact: true });
      await deleteButton.waitFor();
      const targetSize = await deleteButton.evaluate((element) => {
        const { width: targetWidth, height: targetHeight } = element.getBoundingClientRect();
        return { width: targetWidth, height: targetHeight };
      });
      assert.ok(targetSize.width >= 40 && targetSize.height >= 40, `${width}px ${theme}主题删除触控区为 ${targetSize.width}×${targetSize.height}px，应至少为 40×40px`);

      const styleBeforeHover = await deleteButton.evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, backgroundColor: style.backgroundColor };
      });
      await deleteButton.hover();
      const styleOnHover = await deleteButton.evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, backgroundColor: style.backgroundColor };
      });
      assert.notEqual(styleOnHover.color, styleBeforeHover.color, `${width}px ${theme}主题删除按钮悬停文字色有变化`);
      assert.notEqual(styleOnHover.backgroundColor, styleBeforeHover.backgroundColor, `${width}px ${theme}主题删除按钮悬停底色有变化`);

      const deletesBeforeCancel = reportDeleteCount;
      await deleteButton.click();
      await targetPage.page.getByText('删除复盘报告', { exact: true }).waitFor();
      await targetPage.page.getByRole('button', { name: '取消', exact: true }).click();
      await targetPage.page.getByText('删除复盘报告', { exact: true }).waitFor({ state: 'detached' });
      assert.equal(reportDeleteCount, deletesBeforeCancel, `${width}px ${theme}主题打开确认并取消后没有发送删除请求`);
      assert.deepEqual(targetPage.errors, [], `${width}px ${theme}主题删除确认取消流程无浏览器错误`);
      await targetPage.context.close();
    }
  }

  reports = [];
  failNextReportListGet = true;
  const initialReadFailure = await contextPage({ width: 390, height: 844 });
  const reportGetsBeforeInitialFailure = reportListGetCount;
  const creatorDataGetsBeforeInitialFailure = creatorCenterDataGetCount;
  const writesBeforeInitialFailure = { generate: reportGenerateCount, delete: reportDeleteCount };
  await open(initialReadFailure.page, '/analytics/creator-center/reports');
  await initialReadFailure.page.getByText('报告列表暂时不可用', { exact: true }).waitFor();
  await initialReadFailure.page.getByText('报告列表暂时无法读取；恢复读取后再确认是否为空。', { exact: true }).waitFor();
  assert.equal(await initialReadFailure.page.getByText('尚未生成报告', { exact: true }).count(), 0, 'an initial report-list failure is not described as no reports');
  assert.equal(await initialReadFailure.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), false, 'successful creator-center data remains available when only the report-list request fails');
  assert.equal(reportListGetCount, reportGetsBeforeInitialFailure + 1, 'initial report load has exactly one failed list read');
  assert.equal(creatorCenterDataGetCount, creatorDataGetsBeforeInitialFailure + 1, 'creator-center data succeeds independently from the failed report list');
  await initialReadFailure.page.getByRole('button', { name: '重新加载报告', exact: true }).click();
  await initialReadFailure.page.getByText('尚未生成报告', { exact: true }).waitFor();
  assert.equal(await initialReadFailure.page.getByText('报告列表暂时不可用', { exact: true }).count(), 0, 'a successful initial retry clears the report-list error');
  assert.equal(reportListGetCount, reportGetsBeforeInitialFailure + 2, 'report retry performs one additional read');
  assert.equal(creatorCenterDataGetCount, creatorDataGetsBeforeInitialFailure + 2, 'recovery reloads the independent creator-center data used by actions');
  assert.deepEqual({ generate: reportGenerateCount, delete: reportDeleteCount }, writesBeforeInitialFailure, 'report read failures and retries never generate or delete reports');
  assertOnlyInjectedRefreshFailure(initialReadFailure.errors, '初次报告列表读取');
  await initialReadFailure.context.close();

  reports = [{ id: 51, type: 'weekly', created_at: '2026-09-16T08:00:00.000Z', content: { report_version: 1, account_performance: {}, growth: {}, work_performance: {}, anomalies: [] } }];
  const generateFeedback = await contextPage({ width: 390, height: 844 });
  await open(generateFeedback.page, '/analytics/creator-center/reports');
  await generateFeedback.page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('生成日报') && !(button as HTMLButtonElement).disabled));
  const reportGetsBeforeGenerate = reportListGetCount;
  const generatesBefore = reportGenerateCount;
  failNextReportListGet = true;
  await generateFeedback.page.getByRole('button', { name: '生成日报', exact: true }).click();
  const generatedNotice = generateFeedback.page.getByRole('alert').filter({ hasText: '运营日报已生成。' });
  await generatedNotice.waitFor();
  assert.match(await generatedNotice.innerText(), /运营日报已生成。/);
  assert.match(await generatedNotice.innerText(), /列表刷新失败，请重新加载报告；不要重复执行刚才的操作。/);
  assert.equal(reportGenerateCount, generatesBefore + 1, '报告生成只提交一次');
  assert.equal(reportListGetCount, reportGetsBeforeGenerate + 1, '生成后仅执行一次列表读取');
  assert.equal(await generateFeedback.page.getByRole('alert').count(), 1, '已确认生成但列表读取失败时只显示一个操作提示');
  assert.equal(await generateFeedback.page.getByText('运营日报', { exact: true }).count(), 0, '读取失败时不伪称列表已更新');
  assert.equal(await generateFeedback.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), true, '生成已确认但列表未刷新时锁定后续生成');
  assert.equal(await generateFeedback.page.getByRole('button', { name: '删除运营周报' }).isDisabled(), true, '列表未刷新时锁定报告删除');
  await generateFeedback.page.request.post(`${baseUrl}/__test__/fail-next-report-list-get`);
  await generateFeedback.page.reload();
  await generateFeedback.page.getByRole('alert').filter({ hasText: '运营日报已生成。' }).waitFor();
  assert.equal(await generateFeedback.page.getByRole('alert').count(), 1, '已确认写入的待读回锁定不重复显示报告列表读取错误');
  assert.equal(await generateFeedback.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), true, '刷新页面且列表仍无法读取时继续锁定重复生成');
  assert.equal(await generateFeedback.page.getByRole('button', { name: '删除运营周报' }).isDisabled(), true, '刷新页面且列表仍无法读取时继续锁定删除');
  assert.ok(await generateFeedback.page.evaluate(() => Boolean(localStorage.getItem('xmt:creator-report-write-review:douyin-browser-account'))), '刷新失败后账号级等待读回标记仍保留');
  await generateFeedback.page.request.post(`${baseUrl}/__test__/delay-next-report-list-get`, { data: { delayMs: 500 } });
  const deletesBeforeRecovery = reportDeleteCount;
  await generateFeedback.page.getByRole('button', { name: '只重新读取报告', exact: true }).click();
  await generateFeedback.page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('生成日报')) as HTMLButtonElement | undefined;
    return Boolean(button?.disabled);
  });
  assert.equal(await generateFeedback.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), true, '报告列表重载进行时禁止新生成');
  assert.equal(await generateFeedback.page.getByRole('button', { name: '删除运营周报' }).isDisabled(), true, '报告列表重载进行时禁止删除');
  await generateFeedback.page.getByText('运营日报', { exact: true }).waitFor();
  assert.equal(reportGenerateCount, generatesBefore + 1, '重新加载仅读取列表，不重复生成');
  assert.equal(reportListGetCount, reportGetsBeforeGenerate + 3, '重载与只读恢复各只新增一次列表读取');
  assert.equal(reportDeleteCount, deletesBeforeRecovery, '报告列表重载期间没有并行删除');
  assert.equal(await generateFeedback.page.evaluate(() => localStorage.getItem('xmt:creator-report-write-review:douyin-browser-account')), null, '列表成功恢复后自动清除已确认写入的待读回标记');
  await generateFeedback.page.getByRole('button', { name: '删除运营周报' }).click();
  await generateFeedback.page.getByRole('button', { name: '删除报告', exact: true }).waitFor();
  await generateFeedback.page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(generateFeedback.errors.length, 2, '生成后重载场景仅有两次预期注入的列表读取 503');
  assert.ok(generateFeedback.errors.every((message) => message.includes('503')), '生成后重载异常仅来自预期的 HTTP 503');
  await generateFeedback.context.close();

  reports = [{ id: 70, type: 'weekly', created_at: '2026-09-16T08:00:00.000Z', content: { report_version: 1, account_performance: {}, growth: {}, work_performance: {}, anomalies: [] } }];
  const generationResponseLoss = await contextPage({ width: 320, height: 740 });
  await open(generationResponseLoss.page, '/analytics/creator-center/reports');
  await generationResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).waitFor();
  const reportGetsBeforeResponseLoss = reportListGetCount;
  const generatesBeforeResponseLoss = reportGenerateCount;
  await generationResponseLoss.page.request.post(`${baseUrl}/__test__/lose-next-report-generate-response`);
  await generationResponseLoss.page.request.post(`${baseUrl}/__test__/fail-next-report-list-get`);
  await generationResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).click();
  const uncertainGenerationNotice = generationResponseLoss.page.getByRole('alert').filter({ hasText: /生成请求未(收到|获)确认/ });
  await uncertainGenerationNotice.waitFor();
  assert.match(await uncertainGenerationNotice.innerText(), /报告列表暂时无法读取/);
  assert.equal(await generationResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), true, '生成响应和核实读取都失败时锁定再次生成');
  assert.equal(await generationResponseLoss.page.getByRole('button', { name: '删除运营周报' }).isDisabled(), true, '状态未核实前锁定其他报告写入');
  assert.equal(await generationResponseLoss.page.getByRole('alert').count(), 1, '未知结果使用单一可操作告警');
  assert.equal(reportGenerateCount, generatesBeforeResponseLoss + 1, '响应丢失后没有自动或重复生成');
  assert.equal(reportListGetCount, reportGetsBeforeResponseLoss + 1, '响应丢失后只进行一次只读核实');
  await generationResponseLoss.page.getByRole('button', { name: '只重新读取报告', exact: true }).click();
  await uncertainGenerationNotice.getByRole('button', { name: '我已核对，允许继续操作', exact: true }).waitFor();
  assert.match(await uncertainGenerationNotice.innerText(), /列表中出现 1 份新报告/);
  assert.equal(await generationResponseLoss.page.getByRole('button', { name: '删除运营日报', exact: true }).count(), 1, '只读核实显示服务端已新增的日报');
  assert.equal(await generationResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), true, '只读核实后仍需用户核对再解除保护');
  assert.equal(reportGenerateCount, generatesBeforeResponseLoss + 1, '只读恢复不重复生成报告');
  assert.equal(reportListGetCount, reportGetsBeforeResponseLoss + 2, '恢复按钮仅追加一次列表读取');
  assert.ok(await generationResponseLoss.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '320px 未知结果恢复入口无横向溢出');
  const readsBeforeReload = reportListGetCount;
  await generationResponseLoss.page.reload();
  await generationResponseLoss.page.getByRole('alert').filter({ hasText: '此前运营日报生成请求未获确认' }).waitFor();
  assert.equal(await generationResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), true, '页面刷新后仍保持待核实锁定');
  assert.equal(await generationResponseLoss.page.getByRole('button', { name: '删除运营日报', exact: true }).isDisabled(), true, '页面刷新后仍锁定报告删除');
  assert.equal(await generationResponseLoss.page.getByRole('button', { name: '删除运营日报', exact: true }).count(), 1, '页面刷新后保留已读回的新日报');
  assert.equal(reportGenerateCount, generatesBeforeResponseLoss + 1, '页面刷新仅读取，不重复生成');
  const readsAfterReload = reportListGetCount;
  assert.ok(readsAfterReload > readsBeforeReload, '页面刷新会重新读取报告历史');
  await generationResponseLoss.page.getByRole('button', { name: '我已核对，允许继续操作', exact: true }).click();
  assert.equal(await generationResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), false, '用户核对后恢复生成操作');
  assert.equal(reportGenerateCount, generatesBeforeResponseLoss + 1, '解除保护本身不会写入');
  assert.equal(reportListGetCount, readsAfterReload, '解除保护本身不会读取');
  assert.equal(await generationResponseLoss.page.evaluate(() => localStorage.getItem('xmt:creator-report-write-review:douyin-browser-account')), null, '用户确认后清除该账号的待核实标记');
  assert.equal(generationResponseLoss.errors.length, 2, '浏览器中只有夹具主动注入的生成响应与首次核实 503');
  assert.ok(generationResponseLoss.errors.every((message) => message.includes('503')), '异常记录仅对应两个预期 503');
  await generationResponseLoss.context.close();

  reports = [
    { id: 60, type: 'weekly', created_at: '2026-09-16T08:00:00.000Z', content: { report_version: 1, account_performance: {}, growth: {}, work_performance: {}, anomalies: [] } },
    { id: 61, type: 'daily', created_at: '2026-09-15T08:00:00.000Z', content: { report_version: 1, account_performance: {}, growth: {}, work_performance: {}, anomalies: [] } },
  ];
  const deleteFeedback = await contextPage({ width: 390, height: 844 });
  await open(deleteFeedback.page, '/analytics/creator-center/reports');
  await deleteFeedback.page.getByRole('button', { name: '删除运营日报' }).waitFor();
  const reportGetsBeforeDelete = reportListGetCount;
  const deletesBefore = reportDeleteCount;
  failNextReportListGet = true;
  await deleteFeedback.page.getByRole('button', { name: '删除运营日报' }).click();
  await deleteFeedback.page.getByRole('button', { name: '删除报告', exact: true }).click();
  const deletedNotice = deleteFeedback.page.getByRole('status').filter({ hasText: '运营日报已删除。' });
  await deletedNotice.waitFor();
  assert.match(await deletedNotice.innerText(), /运营日报已删除。/);
  assert.match(await deletedNotice.innerText(), /列表刷新失败，请重新加载报告；不要重复执行刚才的操作。/);
  assert.equal(await deleteFeedback.page.getByRole('alert').count(), 1, '已确认删除但列表读取失败时只显示一个操作提示');
  assert.equal(reportDeleteCount, deletesBefore + 1, '删除只提交一次');
  assert.equal(await deleteFeedback.page.getByRole('button', { name: '删除运营日报' }).count(), 0, '服务端确认后先从本地列表移除报告');
  assert.equal(reportListGetCount, reportGetsBeforeDelete + 1, '删除后仅执行一次列表读取');
  await deleteFeedback.page.getByRole('button', { name: '只重新读取报告', exact: true }).click();
  await deleteFeedback.page.getByRole('button', { name: '删除运营周报' }).waitFor();
  assert.equal(reportDeleteCount, deletesBefore + 1, '重新加载仅读取列表，不重复删除');
  assert.equal(reportListGetCount, reportGetsBeforeDelete + 2, '重试只新增一次列表读取');
  assertOnlyInjectedRefreshFailure(deleteFeedback.errors, '删除后刷新');
  await deleteFeedback.context.close();

  reports = [{ id: 62, type: 'daily', created_at: '2026-09-16T08:00:00.000Z', content: { report_version: 1, account_performance: {}, growth: {}, work_performance: {}, anomalies: [] } }];
  const deleteResponseLoss = await contextPage({ width: 320, height: 740 });
  await open(deleteResponseLoss.page, '/analytics/creator-center/reports');
  const reportGetsBeforeDeleteResponseLoss = reportListGetCount;
  const deletesBeforeResponseLoss = reportDeleteCount;
  await deleteResponseLoss.page.request.post(`${baseUrl}/__test__/lose-next-report-delete-response`);
  await deleteResponseLoss.page.request.post(`${baseUrl}/__test__/fail-next-report-list-get`);
  await deleteResponseLoss.page.getByRole('button', { name: '删除运营日报', exact: true }).click();
  await deleteResponseLoss.page.getByRole('button', { name: '删除报告', exact: true }).click();
  const uncertainDeleteNotice = deleteResponseLoss.page.getByRole('alert').filter({ hasText: '删除请求未收到确认' });
  await uncertainDeleteNotice.waitFor();
  assert.match(await uncertainDeleteNotice.innerText(), /报告列表也暂时无法读取/);
  assert.equal(await deleteResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), true, '删除响应与核实读取都失败时锁定报告生成');
  assert.equal(await deleteResponseLoss.page.getByRole('button', { name: '删除运营日报', exact: true }).isDisabled(), true, '删除状态未核实前锁定再次删除');
  assert.equal(reportDeleteCount, deletesBeforeResponseLoss + 1, '删除响应丢失后服务端仅处理一次删除');
  assert.equal(reportListGetCount, reportGetsBeforeDeleteResponseLoss + 1, '删除响应丢失后仅发起一次只读核实');
  await deleteResponseLoss.page.getByRole('button', { name: '只重新读取报告', exact: true }).click();
  await deleteResponseLoss.page.getByRole('alert').filter({ hasText: '该报告已不在当前列表' }).waitFor();
  assert.equal(await deleteResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), true, '只读核实后仍需用户确认才能解除删除保护');
  assert.equal(await deleteResponseLoss.page.getByRole('button', { name: '删除运营日报', exact: true }).count(), 0, '只读核实反映服务端当前报告列表');
  const readsBeforeDeleteReload = reportListGetCount;
  await deleteResponseLoss.page.reload();
  await deleteResponseLoss.page.getByRole('alert').filter({ hasText: '此前运营日报删除请求未获确认' }).waitFor();
  assert.equal(await deleteResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), true, '页面刷新后仍保持删除待核实锁定');
  assert.equal(reportDeleteCount, deletesBeforeResponseLoss + 1, '页面刷新不会重复删除');
  assert.ok(reportListGetCount > readsBeforeDeleteReload, '页面刷新仅读取服务端当前报告列表');
  await deleteResponseLoss.page.getByRole('button', { name: '我已核对，允许继续操作', exact: true }).click();
  assert.equal(await deleteResponseLoss.page.getByRole('button', { name: '生成日报', exact: true }).isDisabled(), false, '用户核对删除状态后解除锁定');
  assert.equal(reportDeleteCount, deletesBeforeResponseLoss + 1, '解除删除保护本身不会写入');
  assert.equal(await deleteResponseLoss.page.evaluate(() => localStorage.getItem('xmt:creator-report-write-review:douyin-browser-account')), null, '用户确认后清除删除待核实标记');
  assert.ok(await deleteResponseLoss.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '320px 删除待核实流程无横向溢出');
  assert.equal(deleteResponseLoss.errors.length, 2, '删除响应丢失场景仅注入删除响应与首次核实读取两个失败');
  assert.ok(deleteResponseLoss.errors.every((message) => message.includes('503')), '删除未知态仅记录夹具主动注入的两个 503');
  await deleteResponseLoss.context.close();

  reports = [{ id: 43, type: 'weekly', created_at: '2026-09-16T08:00:00.000Z', content: { report_version: 1, account_performance: {}, growth: {}, work_performance: {}, anomalies: [{ message: '播放数据暂时缺少日快照，无法计算周期变化。' }] } }];
  const legacyWarning = '这是一份旧口径报告，部分账号指标可能缺失。请重新生成统一口径报告，确认后可删除旧报告。';
  const anomalyMessage = '播放数据暂时缺少日快照，无法计算周期变化。';
  for (const theme of ['light', 'dark'] as const) {
    const themed = await contextPage({ width: 1440, height: 1050 }, theme);
    await open(themed.page, '/analytics/creator-center/reports');
    await assertCreatorReportCopyContrast(themed.page, theme);
    const warning = themed.page.getByText(legacyWarning, { exact: true });
    await warning.waitFor();
    const ratio = await contrastRatio(warning);
    assert.ok(ratio >= 4.5, `旧口径报告警示在${theme === 'light' ? '浅色' : '深色'}主题的对比度为 ${ratio.toFixed(2)}:1，应不低于 4.5:1`);
    for (const label of ['爆款', '优秀', '普通', '低效']) {
      const badgeRatio = await contrastRatio(themed.page.getByText(label, { exact: true }));
      assert.ok(badgeRatio >= 4.5, `作品${label}徽标在${theme === 'light' ? '浅色' : '深色'}主题的对比度为 ${badgeRatio.toFixed(2)}:1，应不低于 4.5:1`);
    }
    const anomaly = themed.page.getByText(anomalyMessage, { exact: true });
    const anomalyRatio = await contrastRatio(anomaly);
    assert.ok(anomalyRatio >= 4.5, `异常说明在${theme === 'light' ? '浅色' : '深色'}主题的对比度为 ${anomalyRatio.toFixed(2)}:1，应不低于 4.5:1`);
    const generateButton = themed.page.getByRole('button', { name: '生成周报', exact: true });
    assert.ok(await generateButton.evaluate((element) => element.classList.contains('xmt-btn-primary')), '生成报告按钮使用品牌主按钮样式，而非白字叠加在青色数据色上');
    await themed.page.screenshot({ path: path.join(screenshotDir, `creator-reports-legacy-${theme}.png`), fullPage: true });
    await themed.page.getByRole('button', { name: '删除运营周报' }).click();
    const confirmDelete = themed.page.getByRole('button', { name: '删除报告', exact: true });
    await confirmDelete.waitFor();
    assert.ok((await confirmDelete.getAttribute('class'))?.includes('xmt-btn-danger'), '危险确认使用主题适配的设计系统按钮');
    assert.ok((await contrastRatio(confirmDelete)) >= 4.5, `${theme}主题删除确认按钮文字对比度应不低于 4.5:1`);
    await themed.page.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(themed.errors, []);
    await themed.context.close();
  }

  console.log(`Creator reports/Auth readiness browser tests passed, including legacy warning contrast in light/dark themes; screenshots: ${screenshotDir}`);
  if (process.env.XMT_BROWSER_MCP_HOLD === '1') {
    console.log(`Local browser MCP fixture ready at ${baseUrl}; press Ctrl-C to stop it.`);
    await new Promise<void>((resolve) => process.once('SIGINT', resolve));
  }
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
}
