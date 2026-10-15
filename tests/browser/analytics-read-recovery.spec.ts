import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 97, username: 'analytics-read-qa', role: 'member', name: '数据复盘验收', enabled: true, force_change_password: false };
const teamStats = { month: 10, year: 2026, completed_count: 6, total_count: 12, overdue_count: 2, completion_rate: '50.0', overdue_rate: '16.7', avg_days: '4.5' };
const monthlyStats = { month: 10, year: 2026, total_views: 12345, total_likes: 520, total_shares: 42, total_comments: 18, topic_count: 3, publication_count: 3, legacy_unlinked_count: 0, legacy_ambiguous_count: 0 };
const userStats = [{ user_id: 7, user_name: '隔离成员', topic_count: 4, total_views: 12000, total_likes: 500 }];
const topicAnalytics = [{
  id: 701,
  topic_id: 501,
  views: 12000,
  likes: 500,
  shares: 40,
  comments: 18,
  data_date: '2026-10-08',
  created_at: '2026-10-08T10:00:00+08:00',
  record_type: 'publishing',
  views_source: 'douyin_official_export',
  likes_source: 'douyin_official_export',
  shares_source: 'douyin_official_export',
  comments_source: 'douyin_official_export',
}];
const weeklyReport = {
  period: { start: '2026-10-05', end: '2026-10-11' },
  summary: { completedTopics: 2, publishedVideos: 3, newTopics: 4, totalViews: 12345, totalLikes: 520, totalShares: 42, totalComments: 18, pomodoroSessions: 5, focusMinutes: 150 },
  details: {
    completedTopics: [{ id: 501, title: '隔离周报选题', updated_at: '2026-10-08T10:00:00+08:00', creator_name: '隔离成员' }],
    publishedVideos: [{ id: 701, topic_title: '隔离周报视频', platform: 'douyin', publish_time: '2026-10-08T10:00:00+08:00' }],
    newTopics: [],
    topInspirations: [],
  },
  generatedAt: '2026-10-09T10:00:00+08:00',
};

let failNextTeamRead = true;
let failNextWeeklyReportRead = true;
let topicReadFailures = 1;
let teamReads = 0;
let monthlyReads = 0;
let userReads = 0;
let topicListReads = 0;
let topicDetailReads = 0;
let weeklyReportReads = 0;
let failNextTopicsExport = false;
let topicsExportReads = 0;
let analyticsExportReads = 0;
let apiWrites = 0;
const requestedPeriods: string[] = [];
let fixturePermissions = ['analytics:view', 'export:data'];
let fixtureRole = user.role;
let personalReportPresent = true;
let teamDailyReads = 0;
const app = express();

app.get('/__qa', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','analytics-read-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/analytics');</script>`));
app.get('/__qa/report-center', (req, res) => {
  fixtureRole = req.query.role === 'director' ? 'director' : user.role;
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify({ ...user, role: fixtureRole }))});localStorage.setItem('xmt_token','analytics-read-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/export');</script>`);
});
app.post('/__qa/grant-daily-team-permission', (_req, res) => {
  fixturePermissions = [...new Set([...fixturePermissions, 'report:daily:view_team'])];
  res.json({ ok: true });
});
app.post('/__qa/clear-personal-report', (_req, res) => {
  personalReportPresent = false;
  res.json({ ok: true });
});
app.post('/__qa/remove-export-permission', (_req, res) => {
  fixturePermissions = ['analytics:view'];
  res.json({ ok: true });
});
app.post('/__qa/fail-next-team-read', (_req, res) => {
  failNextTeamRead = true;
  res.json({ ok: true });
});
app.post('/__qa/fail-next-topic-read', (_req, res) => {
  topicReadFailures += 1;
  res.json({ ok: true });
});
app.post('/__qa/fail-next-weekly-report-read', (_req, res) => {
  failNextWeeklyReportRead = true;
  res.json({ ok: true });
});
app.post('/__qa/fail-next-topics-export', (_req, res) => {
  failNextTopicsExport = true;
  res.json({ ok: true });
});
app.get('/api/auth/me', (_req, res) => res.json({ ...user, role: fixtureRole }));
app.get('/api/permissions/my', (_req, res) => res.json(fixturePermissions));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/daily-reports/me', (_req, res) => res.json({ success: true, data: {
  reportDate: '2026-10-14', template: { id: null, name: '默认模板', description: '', sections: [] },
  canCreate: fixturePermissions.includes('report:daily:submit'),
  report: personalReportPresent ? {
    id: 990, userId: user.id, userName: user.name, reportDate: '2026-10-14', status: 'submitted', manualSummaryMd: '', riskLevel: 'normal', version: 1,
    items: [{ sectionKey: 'today', title: '今日工作', contentMd: '仅查看的已有日报', sortOrder: 0 }],
  } : null,
} }));
app.get('/api/daily-reports/team', (_req, res) => {
  teamDailyReads += 1;
  return res.json({ success: true, data: { reportDate: '2026-10-14', status: 'submitted', reports: [] } });
});
app.get('/api/analytics/team', (req, res) => {
  teamReads += 1;
  requestedPeriods.push(`${req.query.year}-${req.query.month}`);
  if (failNextTeamRead) {
    failNextTeamRead = false;
    return res.status(503).json({ message: '模拟团队统计读取失败' });
  }
  return res.json({ ...teamStats, month: Number(req.query.month), year: Number(req.query.year) });
});
app.get('/api/analytics/monthly', (req, res) => {
  monthlyReads += 1;
  return res.json({ ...monthlyStats, month: Number(req.query.month), year: Number(req.query.year) });
});
app.get('/api/analytics/user', (_req, res) => {
  userReads += 1;
  return res.json(userStats);
});
app.get('/api/analytics/topic/:id', (_req, res) => {
  topicDetailReads += 1;
  if (topicReadFailures > 0) {
    topicReadFailures -= 1;
    return res.status(503).json({ message: '模拟选题数据读取失败' });
  }
  return res.json(topicAnalytics);
});
app.get('/api/export/weekly-report', (_req, res) => {
  weeklyReportReads += 1;
  if (failNextWeeklyReportRead) {
    failNextWeeklyReportRead = false;
    return res.status(503).json({ message: '模拟周报读取失败' });
  }
  return res.json(weeklyReport);
});
app.get('/api/export/topics', async (_req, res) => {
  topicsExportReads += 1;
  await new Promise((resolve) => setTimeout(resolve, 120));
  if (failNextTopicsExport) {
    failNextTopicsExport = false;
    return res.status(503).json({ message: '模拟选题导出失败' });
  }
  return res.json({
    data: [{
      id: 88,
      title: '隔离导出选题,含逗号',
      description: '测试 "引号"',
      status: 'completed',
      platform: 'douyin',
      deadline: '2026-10-10',
      creator_name: '隔离成员',
      assignee_name: '隔离成员',
      created_at: '2026-10-08T10:00:00+08:00',
      updated_at: '2026-10-09T10:00:00+08:00',
    }],
    stats: { total: 1, byStatus: { completed: 1 }, byPlatform: { douyin: 1 } },
    exportTime: '2026-10-09T10:00:00+08:00',
  });
});
app.get('/api/export/analytics', (_req, res) => {
  analyticsExportReads += 1;
  return res.json({
    topicStats: [{ status: 'completed', count: 2 }],
    userActivity: [{ id: 7, name: '隔离成员', topics_created: 4, pomodoros_completed: 2 }],
    dailyTrend: [{ date: '2026-10-08', topics_created: 3 }],
    platformDistribution: [{ platform: 'douyin', count: 1 }],
    exportTime: '2026-10-09T10:00:00+08:00',
  });
});
app.get('/api/topics', (_req, res) => {
  topicListReads += 1;
  return res.json({ data: [{ id: 501, title: '隔离复盘选题', status: 'completed' }], total: 1, page: 1, limit: 10 });
});
app.use('/api', (req, res) => {
  if (req.method !== 'GET') apiWrites += 1;
  return res.json({ data: [], total: 0, page: 1, limit: 20 });
});

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

try {
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '数据复盘', exact: true }).waitFor();
  const identity = await page.evaluate(() => ({
    path: window.location.pathname,
    title: document.title,
    content: document.querySelector('#root')?.textContent?.trim() || '',
    frameworkOverlays: document.querySelectorAll('vite-error-overlay, [data-vite-error-overlay]').length,
  }));
  assert.equal(identity.path, '/analytics', 'the fixture renders the requested analytics page');
  assert.ok(identity.title && identity.content.includes('数据复盘'), 'the app renders non-empty analytics content and a document title');
  assert.equal(identity.frameworkOverlays, 0, 'the page has no Vite error overlay');
  await page.getByRole('alert').getByText(/统计数据暂时无法读取/).waitFor();
  assert.equal(await page.locator('[data-analytics-metric="本月完成"]').getByText('—').count(), 1, 'an initial stats failure shows unknown, not zero');
  assert.equal(await page.locator('[data-analytics-metric="播放量"]').getByText('—').count(), 1, 'an initial monthly metrics failure does not imply zero performance');
  assert.equal(await page.getByText('暂无数据', { exact: true }).count(), 0, 'an initial stats failure is not presented as an empty result');
  await page.getByRole('button', { name: '打开报告中心', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '打开报告中心', exact: true }).isEnabled(), true, 'the separate permission-gated report center remains available during analytics read failure');
  assert.equal(teamReads, 1, 'the initial team-stat failure makes one GET');
  assert.equal(monthlyReads, 1, 'the initial monthly-stat request makes one GET');
  assert.equal(userReads, 1, 'the initial ranking request makes one GET');
  assert.equal(topicListReads, 1, 'the initial topic-list request makes one GET');
  await page.waitForTimeout(250);
  assert.equal(teamReads, 1, 'global feedback updates do not retrigger the failed read');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/xmt-analytics-read-recovery-390.png' });

  await page.getByRole('button', { name: '重新加载统计', exact: true }).click();
  await page.locator('[data-analytics-metric="本月完成"]').getByText('6', { exact: true }).waitFor();
  await page.locator('[data-analytics-metric="播放量"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-analytics-metric="播放量"]')?.textContent?.replace(/\D/g, '') === '12345');
  assert.equal(await page.getByRole('button', { name: '打开报告中心', exact: true }).isEnabled(), true, 'report center access is independent of the currently selected analytics period');
  assert.equal(teamReads, 2, 'the main retry performs one additional read');
  assert.equal(monthlyReads, 2, 'the main retry reads monthly metrics once');
  assert.equal(userReads, 2, 'the main retry reads the ranking once');
  assert.equal(topicListReads, 2, 'the main retry reads completed topics once');

  await page.evaluate(async () => { await fetch('/__qa/fail-next-team-read', { method: 'POST' }); });
  await page.getByLabel('统计月份').selectOption('3');
  await page.getByRole('alert').getByText(/仍显示最近一次成功读取的 \d+年\d+月数据/).waitFor();
  await page.locator('[data-analytics-metric="本月完成"]').getByText('6', { exact: true }).waitFor();
  assert.equal(teamReads, 3, 'changing the period makes one failed refresh request');
  assert.equal(monthlyReads, 3, 'changing the period reads monthly metrics once');
  assert.equal(await page.getByText('暂无数据', { exact: true }).count(), 0, 'a refresh failure preserves loaded results rather than showing an empty ranking');
  assert.equal(await page.getByRole('button', { name: '打开报告中心', exact: true }).isEnabled(), true, 'the report center remains separate from stale period metrics');
  await page.getByRole('button', { name: '重新加载统计', exact: true }).click();
  await page.locator('[data-analytics-metric="本月完成"]').getByText('6', { exact: true }).waitFor();
  assert.equal(teamReads, 4, 'retry after a period refresh failure is read-only and runs once');
  assert.ok(requestedPeriods.at(-1)?.endsWith('-3'), 'the retry uses the selected period');
  assert.equal(apiWrites, 0, 'analytics data recovery does not issue a write');

  await page.getByLabel('选择已完成选题').selectOption('501');
  await page.getByRole('alert').getByText(/选题的数据暂时无法读取/).waitFor();
  assert.equal(await page.getByText('选择选题后查看数据明细', { exact: true }).count(), 0, 'a failed selected-topic read is not misreported as no selection');
  assert.equal(topicDetailReads, 1, 'selecting a topic reads its analytics once');
  await page.getByRole('button', { name: '重试选题数据', exact: true }).click();
  await page.getByText('2026-10-08', { exact: true }).waitFor();
  assert.equal(topicDetailReads, 2, 'topic retry performs one additional GET');

  await page.evaluate(async () => { await fetch('/__qa/fail-next-topic-read', { method: 'POST' }); });
  await page.getByRole('button', { name: '刷新选题数据', exact: true }).click();
  await page.getByRole('alert').getByText(/仍保留最近一次成功读取的记录/).waitFor();
  await page.getByText('2026-10-08', { exact: true }).waitFor();
  await page.getByRole('button', { name: '重试选题数据', exact: true }).click();
  await page.getByText('2026-10-08', { exact: true }).waitFor();
  assert.equal(topicDetailReads, 4, 'selected-topic refresh failure and recovery each perform one GET');

  await page.goto(`${base}/export`);
  await page.getByRole('heading', { name: '报告中心', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '日报', exact: true }).count(), 0, 'report-only permission does not expose unavailable daily-report shortcuts');
  await page.getByRole('button', { name: '周报', exact: true }).click();
  await page.getByRole('heading', { name: '周报生成', exact: true }).waitFor();
  await page.getByRole('alert').getByText(/周报暂时无法读取/).waitFor();
  await page.screenshot({ path: '/tmp/xmt-weekly-report-read-recovery-390.png' });
  const weeklyRefreshBox = await page.getByRole('button', { name: '刷新', exact: true }).boundingBox();
  const weeklyCopyBox = await page.getByRole('button', { name: '一键复制', exact: true }).boundingBox();
  assert.ok(weeklyRefreshBox && weeklyRefreshBox.width >= 64 && weeklyRefreshBox.height >= 40, 'weekly refresh remains legible and tappable on mobile');
  assert.ok(weeklyCopyBox && weeklyCopyBox.width >= 100 && weeklyCopyBox.height >= 40, `weekly copy remains legible and tappable on mobile: ${JSON.stringify(weeklyCopyBox)}`);
  assert.equal(weeklyReportReads, 1, 'the weekly report makes one initial read');
  assert.equal(await page.getByText('本周暂无完成的选题和发布的视频', { exact: true }).count(), 0, 'a failed weekly report read is not presented as a real empty week');
  assert.equal(await page.getByRole('button', { name: '一键复制', exact: true }).isDisabled(), true, 'an unavailable weekly report cannot be copied');
  await page.getByRole('button', { name: '重试周报', exact: true }).click();
  await page.getByText('隔离周报选题', { exact: true }).waitFor();
  assert.equal(weeklyReportReads, 2, 'weekly report retry performs one additional read');

  await page.evaluate(async () => { await fetch('/__qa/fail-next-weekly-report-read', { method: 'POST' }); });
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByRole('alert').getByText(/仍显示最近一次成功读取的 2026-10-05 至 2026-10-11 数据/).waitFor();
  await page.getByText('隔离周报选题', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '一键复制', exact: true }).isDisabled(), true, 'a stale weekly report cannot be copied after refresh failure');
  assert.equal(weeklyReportReads, 3, 'weekly report refresh failure performs one GET');
  await page.getByRole('button', { name: '重试周报', exact: true }).click();
  await page.getByText('隔离周报选题', { exact: true }).waitFor();
  await page.locator('p[role="status"]').waitFor({ state: 'detached' });
  assert.equal(weeklyReportReads, 4, 'weekly report recovery performs one additional GET');
  assert.equal(await page.getByRole('button', { name: '一键复制', exact: true }).isDisabled(), false, 'a successful report read restores copy access');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    document.execCommand = Boolean.prototype.valueOf.bind(false);
  });
  await page.getByRole('button', { name: '一键复制', exact: true }).click();
  await page.getByRole('alert').getByText(/浏览器未能复制周报/).waitFor();
  assert.equal(await page.getByText('周报已复制到剪贴板', { exact: true }).count(), 0, 'a rejected legacy clipboard fallback is never reported as success');
  assert.equal(await page.locator('textarea[aria-hidden="true"]').count(), 0, 'the temporary fallback textarea is removed after a failed copy');

  await page.evaluate(() => { document.execCommand = Boolean.prototype.valueOf.bind(true); });
  await page.getByRole('button', { name: '一键复制', exact: true }).click();
  await page.getByText('周报已复制到剪贴板', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').getByText(/浏览器未能复制周报/).count(), 0, 'a successful fallback clears the persistent copy error');
  assert.equal(await page.locator('textarea[aria-hidden="true"]').count(), 0, 'the temporary fallback textarea is removed after a successful copy');

  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page.evaluate(async () => { await fetch('/__qa/fail-next-topics-export', { method: 'POST' }); });
  await page.getByRole('button', { name: '开始导出', exact: true }).dblclick({ delay: 50 });
  assert.equal(await page.getByRole('button', { name: '导出中...', exact: true }).isDisabled(), true, 'the export action locks while the request is in flight');
  await page.getByRole('alert').getByText(/导出选题数据失败/).waitFor();
  assert.equal(topicsExportReads, 1, 'the failed topics export makes one GET');
  assert.equal(await page.getByRole('button', { name: '开始导出', exact: true }).isDisabled(), false, 'the export action unlocks after failure for an explicit retry');

  const topicsDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '开始导出', exact: true }).click();
  const topicsDownload = await topicsDownloadPromise;
  assert.match(topicsDownload.suggestedFilename(), /^选题数据_\d{4}-\d{2}-\d{2}\.csv$/, 'the topics export downloads a dated CSV');
  const topicsDownloadPath = await topicsDownload.path();
  assert.ok(topicsDownloadPath, 'the topics CSV is available from the isolated browser download');
  const topicsCsv = readFileSync(topicsDownloadPath, 'utf8');
  assert.ok(topicsCsv.includes('"隔离导出选题,含逗号"'), 'the exported CSV contains correctly quoted isolated topic data');
  assert.ok(topicsCsv.includes(',已完成,抖音,'), 'human-readable CSV uses Chinese status and known platform names');
  await page.locator('p[role="status"]').getByText(/已生成 1 条记录，文件已开始下载/).waitFor();
  assert.equal(topicsExportReads, 2, 'the explicit retry performs exactly one additional GET');

  await page.getByRole('button', { name: /数据分析/ }).click();
  const analyticsDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '开始导出', exact: true }).click();
  const analyticsDownload = await analyticsDownloadPromise;
  assert.match(analyticsDownload.suggestedFilename(), /^数据分析_\d{4}-\d{2}-\d{2}\.csv$/, 'the analytics export downloads a dated CSV');
  await page.locator('p[role="status"]').getByText(/已生成 4 条记录，文件已开始下载/).waitFor();
  const analyticsDownloadPath = await analyticsDownload.path();
  assert.ok(analyticsDownloadPath, 'the analytics CSV is available from the isolated browser download');
  const analyticsCsv = readFileSync(analyticsDownloadPath, 'utf8');
  assert.ok(analyticsCsv.includes('选题状态,已完成,,,2'), 'the analytics CSV maps the topic-status summary using its business label');
  assert.ok(analyticsCsv.includes('成员活动,隔离成员,4,2,'), 'the analytics CSV maps member activity without inventing publication metrics');
  assert.ok(analyticsCsv.includes('每日趋势,2026-10-08,3,,'), 'the analytics CSV maps the daily topic trend');
  assert.ok(analyticsCsv.includes('平台分布,抖音,,,1'), 'the analytics CSV maps platform distribution using its business label');
  assert.equal(analyticsExportReads, 1, 'the analytics CSV path performs one GET');

  const topicJsonDownloadPromise = page.waitForEvent('download');
  await page.getByRole('heading', { name: '选题数据文件', exact: true }).locator('xpath=..').getByRole('button', { name: '导出 JSON', exact: true }).dblclick({ delay: 40 });
  const topicJsonDownload = await topicJsonDownloadPromise;
  const topicJsonPath = await topicJsonDownload.path();
  assert.ok(topicJsonPath, 'the topics JSON backup is available from the isolated browser download');
  const topicJson = JSON.parse(readFileSync(topicJsonPath, 'utf8'));
  assert.equal(topicJson.data[0].title, '隔离导出选题,含逗号', 'the topics JSON backup preserves the actual response envelope');
  assert.equal(topicJson.data[0].status, 'completed', 'machine-readable JSON preserves the original status code');
  assert.equal(topicJson.data[0].platform, 'douyin', 'machine-readable JSON preserves the original platform code');
  assert.equal(topicsExportReads, 3, 'a rapid double trigger of JSON backup performs only one additional GET');
  await page.locator('p[role="status"]').getByText(/^选题数据_.*\.json 已开始下载。$/).waitFor();
  assert.equal(await page.getByRole('heading', { name: '完整数据备份（JSON）', exact: true }).count(), 0, 'module exports must not be advertised as a complete system backup');

  const analyticsJsonDownloadPromise = page.waitForEvent('download');
  await page.getByRole('heading', { name: '分析汇总文件', exact: true }).locator('xpath=..').getByRole('button', { name: '导出 JSON', exact: true }).click();
  const analyticsJsonDownload = await analyticsJsonDownloadPromise;
  const analyticsJsonPath = await analyticsJsonDownload.path();
  assert.ok(analyticsJsonPath, 'the analytics JSON backup is available from the isolated browser download');
  const analyticsJson = JSON.parse(readFileSync(analyticsJsonPath, 'utf8'));
  assert.equal(analyticsJson.userActivity[0].pomodoros_completed, 2, 'the analytics JSON backup preserves its actual grouped fields');
  assert.equal(analyticsExportReads, 2, 'the analytics JSON backup performs one additional GET');

  const readonlyDailyPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  readonlyDailyPage.on('pageerror', (error) => errors.push(error.message));
  await readonlyDailyPage.goto(`${base}/__qa/report-center`);
  await readonlyDailyPage.getByRole('heading', { name: '报告中心', exact: true }).waitFor();
  await readonlyDailyPage.goto(`${base}/daily-report`);
  await readonlyDailyPage.getByText('当前日报为只读；如需填写或提交，请联系管理员开通日报权限。', { exact: true }).waitFor();
  const readonlyInput = readonlyDailyPage.getByPlaceholder('记录今天完成或推进的工作');
  assert.equal(await readonlyInput.inputValue(), '仅查看的已有日报');
  assert.equal(await readonlyInput.isDisabled(), true, 'an account without submission permission can read its existing report without editing it');
  assert.equal(await readonlyDailyPage.getByRole('button', { name: '提交日报', exact: true }).count(), 0, 'read-only viewers have a reason instead of an unavailable submission button');
  await readonlyDailyPage.screenshot({ path: '/tmp/xmt-daily-readonly-permission.png', fullPage: false });
  await readonlyDailyPage.request.post(`${base}/__qa/clear-personal-report`);
  await readonlyDailyPage.reload();
  await readonlyDailyPage.getByRole('heading', { name: '当前没有日报记录', exact: true }).waitFor();
  await readonlyDailyPage.goto(`${base}/daily-report/team`);
  await readonlyDailyPage.getByRole('heading', { name: '当前账号无权查看团队日报', exact: true }).waitFor();
  assert.equal(teamDailyReads, 0, 'unavailable team views do not fetch data or masquerade as empty reports');
  await readonlyDailyPage.close();

  const revokedDirectorPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  revokedDirectorPage.on('pageerror', (error) => errors.push(error.message));
  await revokedDirectorPage.goto(`${base}/__qa/report-center?role=director`);
  await revokedDirectorPage.getByRole('heading', { name: '报告中心', exact: true }).waitFor();
  await revokedDirectorPage.goto(`${base}/daily-report/team`);
  await revokedDirectorPage.getByRole('heading', { name: '当前账号无权查看团队日报', exact: true }).waitFor();
  assert.equal(teamDailyReads, 0, 'a director role label does not bypass a revoked effective team permission');
  await revokedDirectorPage.close();

  await page.request.post(`${base}/__qa/grant-daily-team-permission`);
  const allowedTeamPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  allowedTeamPage.on('pageerror', (error) => errors.push(error.message));
  await allowedTeamPage.goto(`${base}/__qa/report-center`);
  await allowedTeamPage.getByRole('button', { name: '日报', exact: true }).click();
  const teamRead = allowedTeamPage.waitForResponse((response) => response.url().includes('/api/daily-reports/team') && response.status() === 200);
  await allowedTeamPage.getByRole('link', { name: '查看团队日报', exact: true }).click();
  await teamRead;
  await allowedTeamPage.getByRole('heading', { name: '团队日报', exact: true }).waitFor();
  assert.equal(teamDailyReads, 1, 'an explicit team permission exposes a working shortcut and makes one read');
  await allowedTeamPage.close();

  assert.equal(apiWrites, 0, 'all analytics retries remain read-only');
  assert.equal(expectedHttpErrors.length, 7, 'the browser records only the seven intentionally injected read failures');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'the analytics view fits a 390px viewport');
  assert.deepEqual(errors, [], 'the analytics page has no unexpected browser errors');

  await page.evaluate(async () => { await fetch('/__qa/remove-export-permission', { method: 'POST' }); });
  const restrictedPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await restrictedPage.goto(`${base}/__qa/report-center`);
  await restrictedPage.getByRole('heading', { name: '你暂时没有访问这个页面的权限', exact: true }).waitFor();
  assert.equal(await restrictedPage.getByRole('heading', { name: '报告中心', exact: true }).count(), 0, 'analytics:view alone does not grant access to report exports');
  await restrictedPage.close();
  console.log('Analytics browser test passed: read failures recover truthfully, weekly clipboard fallback reports actual results, and topic/analytics CSV exports preserve failure, retry, and download feedback without writes.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
