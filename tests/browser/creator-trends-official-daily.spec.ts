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
let emptyFansForNextTrendGet = false;
let missingFirstFanForNextTrendGet = false;
let emptySnapshotsForNextTrendGet = false;
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
  const emptyFans = emptyFansForNextTrendGet;
  const missingFirstFan = missingFirstFanForNextTrendGet;
  const emptySnapshots = emptySnapshotsForNextTrendGet;
  emptyFansForNextTrendGet = false;
  missingFirstFanForNextTrendGet = false;
  emptySnapshotsForNextTrendGet = false;
  const snapshots = period === '90d' || emptySnapshots ? [] : [
    { snapshot_date: '2026-09-15', fans_count: 100, works_count: 1, play_count: 100, like_count: 10, comment_count: 1, share_count: 1, interaction_count: 12, tracked_interaction_rate: .12 },
    { snapshot_date: '2026-09-16', fans_count: 105, works_count: 0, play_count: 200, like_count: 20, comment_count: 2, share_count: 3, interaction_count: 25, tracked_interaction_rate: .125 },
  ];
  const trendSnapshots = snapshots.map((snapshot, index) => ({ ...snapshot, fans_count: emptyFans || (missingFirstFan && index === 0) ? null : snapshot.fans_count }));
  response.json({
    period,
    snapshots: trendSnapshots,
    source: 'creator_official_daily_metrics', metric_semantics: 'daily_flow', data_status: 'partial', snapshot_start_date: period === '90d' ? null : '2026-09-15', missing_fields: period === '90d' ? ['period_daily_metrics'] : [],
    note: period === '90d' ? '近 90 天官方逐日数据不完整。' : '播放、互动和投稿是官方导出的逐日流量，周期卡片按日求和。',
  });
});
app.post('/__test__/fail-next-trend-get', (_request, response) => {
  failNextTrendGet = true;
  response.sendStatus(204);
});
app.post('/__test__/empty-fans-next-trend-get', (_request, response) => {
  emptyFansForNextTrendGet = true;
  response.sendStatus(204);
});
app.post('/__test__/missing-first-fan-next-trend-get', (_request, response) => {
  missingFirstFanForNextTrendGet = true;
  response.sendStatus(204);
});
app.post('/__test__/empty-snapshots-next-trend-get', (_request, response) => {
  emptySnapshotsForNextTrendGet = true;
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

async function assertTrendChartToken(page: import('playwright').Page, metric: string, token: string, theme: 'light' | 'dark') {
  const chart = page.getByRole('img', { name: `${metric}折线图，周期内 2 个日数据`, exact: true });
  const colors = await chart.locator('polyline').evaluate((line, customProperty) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${customProperty})`;
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { actual: getComputedStyle(line).stroke, expected };
  }, token);
  assert.equal(colors.actual, colors.expected, `${theme}主题${metric}曲线应使用 ${token} Studio 令牌`);
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
    const periodGroup = page.getByRole('group', { name: '数据统计周期', exact: true });
    assert.equal(await periodGroup.count(), 1, `${name}页的统计周期按钮有可访问组名`);
    assert.equal(await periodGroup.getByRole('button').count(), 3, `${name}页的统计周期组包含三个选项`);
    const periodButtonHeights = await periodGroup.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    assert.ok(periodButtonHeights.every((height) => height >= 40), `${name}页的三个统计周期按钮均达到 40px 触控高度：${periodButtonHeights.join(', ')}`);
    assert.equal(await periodGroup.getByRole('button', { name: '30 天', exact: true }).getAttribute('aria-pressed'), 'true', '默认 30 天周期已播报为选中');
    for (const metric of ['播放趋势', '粉丝趋势', '互动趋势', '日互动率', '投稿数量']) {
      assert.equal(await page.getByRole('img', { name: `${metric}折线图，周期内 2 个日数据`, exact: true }).count(), 1, `${name}页的${metric}图表应有独立可访问名称`);
    }
    const playTable = page.getByRole('table', { name: '播放趋势折线图，周期内 2 个日数据：日期与数值明细', exact: true });
    assert.equal(await playTable.count(), 1, `${name}页的播放趋势图提供屏幕阅读器可访问的数据表`);
    const firstPlayRow = playTable.getByRole('row').nth(1);
    const secondPlayRow = playTable.getByRole('row').nth(2);
    assert.equal(await firstPlayRow.getByRole('rowheader').innerText(), '2026/09/15', '播放趋势明细保留第一条自然日日期');
    assert.equal(await firstPlayRow.getByRole('cell').innerText(), '100', '播放趋势明细保留第一条实际播放值');
    assert.equal(await secondPlayRow.getByRole('rowheader').innerText(), '2026/09/16', '播放趋势明细保留第二条自然日日期');
    assert.equal(await secondPlayRow.getByRole('cell').innerText(), '200', '播放趋势明细保留第二条实际播放值');
    const rateTable = page.getByRole('table', { name: '日互动率折线图，周期内 2 个日数据：日期与数值明细', exact: true });
    assert.equal(await rateTable.getByRole('row').nth(1).getByRole('cell').innerText(), '12.00%', '比例指标明细使用与趋势摘要一致的百分比格式');
    for (const [metric, token] of [['播放趋势', '--xmt-cyan'], ['粉丝趋势', '--xmt-success'], ['互动趋势', '--xmt-coral'], ['日互动率', '--xmt-amber'], ['投稿数量', '--xmt-violet']] as const) {
      await assertTrendChartToken(page, metric, token, 'dark');
    }
    await assertTrendCopyContrast(page, 'dark');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}暗色趋势页无横向溢出`);
    assert.equal(await page.getByText('周期合计', { exact: true }).count(), 4);
    await periodGroup.getByRole('button', { name: '7 天', exact: true }).click();
    await page.getByText('300', { exact: true }).first().waitFor();
    assert.equal(await periodGroup.getByRole('button', { name: '7 天', exact: true }).getAttribute('aria-pressed'), 'true', '7 天切换后暴露选中状态');
    assert.equal(await periodGroup.getByRole('button', { name: '30 天', exact: true }).getAttribute('aria-pressed'), 'false', '切换后取消 30 天的选中状态');
    await periodGroup.getByRole('button', { name: '90 天', exact: true }).click();
    await page.getByRole('status').getByText('缺失日期不会按 0 计入。').waitFor();
    assert.equal(await periodGroup.getByRole('button', { name: '90 天', exact: true }).getAttribute('aria-pressed'), 'true', '90 天切换后暴露选中状态');
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
  assert.equal(await lightPage.getByRole('img', { name: '播放趋势折线图，周期内 2 个日数据', exact: true }).count(), 1, '亮色趋势图表应保留指标名称');
  for (const [metric, token] of [['播放趋势', '--xmt-cyan'], ['粉丝趋势', '--xmt-success'], ['互动趋势', '--xmt-coral'], ['日互动率', '--xmt-amber'], ['投稿数量', '--xmt-violet']] as const) {
    await assertTrendChartToken(lightPage, metric, token, 'light');
  }
  await assertTrendCopyContrast(lightPage, 'light');
  assert.ok(await lightPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '390px 亮色趋势页无横向溢出');
  await lightContext.close();

  const emptyFansContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await emptyFansContext.addInitScript(({ user }) => { localStorage.setItem('xmt_user', JSON.stringify(user)); localStorage.setItem('xmt_token', 'browser-token'); localStorage.setItem('xmt_theme', 'dark'); localStorage.setItem('xmt_last_version_seen', '3.0.0'); }, { user });
  const emptyFansPage = await emptyFansContext.newPage();
  await emptyFansPage.request.post(`http://127.0.0.1:${address.port}/__test__/empty-fans-next-trend-get`);
  await emptyFansPage.goto(`http://127.0.0.1:${address.port}/analytics/creator-center/trends`, { waitUntil: 'domcontentloaded' });
  await emptyFansPage.getByRole('heading', { name: '数据趋势中心' }).waitFor();
  await emptyFansPage.getByText('播放、互动和投稿是官方导出的逐日流量，周期卡片按日求和。', { exact: false }).waitFor();
  const emptyFansStatus = emptyFansPage.getByRole('status').filter({ hasText: '暂无数据' });
  assert.equal(await emptyFansStatus.count(), 1, '成功响应中缺少粉丝指标时，应提供唯一的空状态播报');
  assert.equal(await emptyFansStatus.getAttribute('aria-live'), 'polite', '粉丝空状态应使用礼貌播报');
  assert.equal(await emptyFansStatus.getAttribute('aria-atomic'), 'true', '粉丝空状态应整体播报');
  assert.equal(await emptyFansPage.getByRole('img', { name: '粉丝趋势折线图，周期内 2 个日数据', exact: true }).count(), 0, '粉丝数据为空时不应伪造粉丝图表');
  for (const metric of ['播放趋势', '互动趋势', '日互动率', '投稿数量']) {
    assert.equal(await emptyFansPage.getByRole('img', { name: `${metric}折线图，周期内 2 个日数据`, exact: true }).count(), 1, `粉丝数据为空时仍应显示${metric}图表`);
  }
  await emptyFansContext.close();

  const missingFanContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await missingFanContext.addInitScript(({ user }) => { localStorage.setItem('xmt_user', JSON.stringify(user)); localStorage.setItem('xmt_token', 'browser-token'); localStorage.setItem('xmt_theme', 'dark'); localStorage.setItem('xmt_last_version_seen', '3.0.0'); }, { user });
  const missingFanPage = await missingFanContext.newPage();
  await missingFanPage.request.post(`http://127.0.0.1:${address.port}/__test__/missing-first-fan-next-trend-get`);
  await missingFanPage.goto(`http://127.0.0.1:${address.port}/analytics/creator-center/trends`, { waitUntil: 'domcontentloaded' });
  await missingFanPage.getByRole('heading', { name: '数据趋势中心' }).waitFor();
  const fanTable = missingFanPage.getByRole('table', { name: '粉丝趋势折线图，周期内 1 个日数据：日期与数值明细', exact: true });
  assert.equal(await fanTable.count(), 1, '部分缺失粉丝值仍保留完整日期范围的数据表');
  assert.equal(await fanTable.getByRole('row').nth(1).getByRole('rowheader').innerText(), '2026/09/15');
  assert.equal(await fanTable.getByRole('row').nth(1).getByRole('cell').innerText(), '暂无数据', '空值日期明确播报暂无数据，不伪装为零');
  assert.equal(await fanTable.getByRole('row').nth(2).getByRole('cell').innerText(), '105', '空值之后的日期和值仍保持对应关系');
  await missingFanContext.close();

  const noSnapshotsContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await noSnapshotsContext.addInitScript(({ user }) => { localStorage.setItem('xmt_user', JSON.stringify(user)); localStorage.setItem('xmt_token', 'browser-token'); localStorage.setItem('xmt_theme', 'dark'); localStorage.setItem('xmt_last_version_seen', '3.0.0'); }, { user });
  const noSnapshotsPage = await noSnapshotsContext.newPage();
  await noSnapshotsPage.request.post(`http://127.0.0.1:${address.port}/__test__/empty-snapshots-next-trend-get`);
  await noSnapshotsPage.goto(`http://127.0.0.1:${address.port}/analytics/creator-center/trends`, { waitUntil: 'domcontentloaded' });
  await noSnapshotsPage.getByRole('heading', { name: '数据趋势中心' }).waitFor();
  const emptyPlayTable = noSnapshotsPage.getByRole('table', { name: '播放趋势折线图，周期内 0 个日数据：日期与数值明细', exact: true });
  assert.equal(await emptyPlayTable.count(), 1, '没有日期数据时图表仍提供稳定的辅助表格');
  assert.equal(await emptyPlayTable.getByRole('row').nth(1).getByRole('cell').innerText(), '周期内暂无数据', '空序列提供清楚的无数据文本');
  await noSnapshotsContext.close();

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
