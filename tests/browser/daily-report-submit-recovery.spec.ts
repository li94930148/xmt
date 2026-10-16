import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';
import { dailyReportStatusLabel } from '../../src/components/daily-report/dailyReportStatusLabel';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
assert.deepEqual(
  ['draft', 'submitted', 'approved', 'rejected', 'archived'].map(dailyReportStatusLabel),
  ['草稿', '已提交', '已审核', '已退回', '已归档'],
  'known daily-report states should retain their distinct business meanings',
);
assert.equal(dailyReportStatusLabel('future_status'), '状态待确认', 'unknown daily-report states should not be misreported as draft or submitted');
assert.equal(dailyReportStatusLabel(null), '状态待确认', 'missing daily-report state should use a neutral label');
const user = { id: 953, username: 'daily-report-qa', role: 'admin', name: '日报恢复验收', enabled: true, force_change_password: false };
const reportDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
type FixtureReport = {
  id: number;
  userId: number;
  userName: string;
  reportDate: string;
  status: 'draft' | 'submitted';
  manualSummaryMd: string;
  riskLevel: 'normal';
  version: number;
  items: Array<{ id?: number; sectionKey: string; title: string; contentMd: string; sortOrder: number }>;
};

let report: FixtureReport | null = null;
let draftVersions: Array<number | null> = [];
let draftRequests = 0;
let submitRequests = 0;
let failNextSubmit = true;
let summaryWriteRequests = 0;
let failNextSummaryWrite = true;
let yearlyWriteRequests = 0;
let userDirectoryRequests = 0;
let failNextUserDirectoryRead = true;

function resetFixture() {
  report = null;
  draftVersions = [];
  draftRequests = 0;
  submitRequests = 0;
  failNextSubmit = true;
  summaryWriteRequests = 0;
  failNextSummaryWrite = true;
  yearlyWriteRequests = 0;
  userDirectoryRequests = 0;
  failNextUserDirectoryRead = true;
}

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => {
  resetFixture();
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','daily-report-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/daily-report');</script>`);
});
app.get('/__qa/state', (_req, res) => res.json({ report, draftVersions, draftRequests, submitRequests, failNextSubmit, userDirectoryRequests }));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/users', (_req, res) => {
  userDirectoryRequests += 1;
  if (failNextUserDirectoryRead) {
    failNextUserDirectoryRead = false;
    return res.status(503).json({ success: false, message: '模拟成员名单读取失败' });
  }
  return res.json({ success: true, data: [{ ...user, created_at: '2026-01-01T00:00:00.000Z' }] });
});
app.get('/api/daily-reports/me', (_req, res) => res.json({
  success: true,
  data: { reportDate, template: { id: null, name: '默认模板', description: '', sections: [] }, report, canCreate: true },
}));
app.post('/api/daily-reports/draft', async (req, res) => {
  draftRequests += 1;
  const submittedVersion = typeof req.body?.version === 'number' ? req.body.version : null;
  draftVersions.push(submittedVersion);
  if (report && submittedVersion !== report.version) {
    return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: '日报版本已变化，请刷新后再保存' });
  }
  report = {
    id: report?.id ?? 990,
    userId: user.id,
    userName: user.name,
    reportDate,
    status: 'draft',
    manualSummaryMd: req.body?.manualSummaryMd ?? '',
    riskLevel: 'normal',
    version: (report?.version ?? 0) + 1,
    items: req.body?.items ?? [],
  };
  await new Promise<void>((resolve) => setTimeout(resolve, 400));
  return res.json({ success: true, data: report });
});
app.post('/api/daily-reports/:id/submit', (req, res) => {
  submitRequests += 1;
  if (!report || report.id !== Number(req.params.id)) return res.status(404).json({ success: false, message: '日报不存在' });
  if (failNextSubmit) {
    failNextSubmit = false;
    return res.status(503).json({ success: false, message: '模拟提交失败' });
  }
  report = { ...report, status: 'submitted', version: report.version + 1 };
  return res.json({ success: true, data: report });
});
app.get('/api/daily-reports/archive', (_req, res) => res.json({ success: true, data: {
  start: reportDate,
  end: reportDate,
  userId: user.id,
  reports: ['draft', 'submitted', 'approved', 'rejected', 'archived', 'constructor'].map((status, index) => ({
    id: 991 + index,
    userId: user.id,
    userName: `日报状态 ${index + 1}`,
    reportDate,
    status,
    manualSummaryMd: '',
    riskLevel: 'normal',
    version: 1,
    items: [],
  })),
} }));
app.get('/api/report-summaries/archive', (req, res) => {
  const year = Number(req.query.year);
  return res.json({ success: true, data: {
    year,
    monthly: [{
      id: 997, year, month: 8, user_name: user.name,
      work_summary_md: '完整工作总结', key_projects_md: '完整重点项目', issues_plan_md: '完整问题与计划',
      display_content_md: '完整工作总结', created_at: `${year}-08-01T00:00:00.000Z`, updated_at: `${year}-08-02T00:00:00.000Z`,
    }],
    yearly: [{
      id: 998, year, user_name: user.name,
      annual_summary_md: '完整年度总结', achievements_md: '完整主要成果', shortcomings_md: '', next_year_plan_md: '完整下一年度计划',
      display_content_md: '完整年度总结',
    }],
  } });
});
app.get('/api/report-summaries/monthly', (req, res) => res.json({ success: true, data: {
  year: Number(req.query.year), month: Number(req.query.month), work_summary_md: '', key_projects_md: '', issues_plan_md: '', display_content_md: '',
} }));
app.put('/api/report-summaries/monthly', async (req, res) => {
  summaryWriteRequests += 1;
  await new Promise<void>((resolve) => setTimeout(resolve, 400));
  if (failNextSummaryWrite) {
    failNextSummaryWrite = false;
    return res.status(503).json({ success: false, message: '模拟月报提交失败' });
  }
  return res.json({ success: true, data: { ...req.body, year: Number(req.query.year), month: Number(req.query.month) } });
});
app.get('/api/report-summaries/yearly', (req, res) => res.json({ success: true, data: {
  year: Number(req.query.year), annual_summary_md: '', achievements_md: '', shortcomings_md: '', next_year_plan_md: '', display_content_md: '',
} }));
app.put('/api/report-summaries/yearly', async (req, res) => {
  yearlyWriteRequests += 1;
  await new Promise<void>((resolve) => setTimeout(resolve, 400));
  return res.json({ success: true, data: { ...req.body, year: Number(req.query.year) } });
});
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_DAILY_REPORT_QA_SERVE === '1') {
  console.log(`Isolated Daily Report submit QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const unexpectedErrors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => unexpectedErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else unexpectedErrors.push(message.text());
  });

  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '日报' }).waitFor();
  const editor = page.getByPlaceholder('记录今天完成或推进的工作');
  await editor.waitFor();
  await editor.fill('完成日报草稿保存与提交分步恢复验收');
  const firstSubmitFailure = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().includes('/api/daily-reports/990/submit') && response.status() === 503);
  const firstDraftWrite = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/daily-reports/draft'));
  const firstSubmitClick = page.getByRole('button', { name: '提交日报', exact: true }).dblclick();
  await firstDraftWrite;
  await page.getByRole('button', { name: '提交中', exact: true }).waitFor();
  const inputLockedDuringSubmit = await editor.isDisabled();
  const refreshLockedDuringSubmit = await page.getByRole('button', { name: '刷新', exact: true }).isDisabled();
  await firstSubmitClick;
  await firstSubmitFailure;
  assert.equal(inputLockedDuringSubmit, true, 'the draft input is locked while submission is pending so a late response cannot discard new typing');
  assert.equal(refreshLockedDuringSubmit, true, 'a pending write cannot race with a refresh of the old report');

  const warning = page.getByRole('alert').filter({ hasText: '日报草稿已保存，但提交失败' });
  await warning.waitFor();
  assert.equal(await editor.isDisabled(), false, 'a failed submit unlocks the retained draft for editing and retry');
  assert.match(await warning.innerText(), /当前草稿版本已保留/);
  assert.match(await warning.innerText(), /再次点击“提交日报”重试/);
  assert.equal(await page.getByText('日报草稿已保存，尚未提交', { exact: true }).count(), 0, 'the persistent in-page recovery notice should not be duplicated by a global warning toast');
  assert.equal(await editor.inputValue(), '完成日报草稿保存与提交分步恢复验收', 'the draft remains visible after the later submit request fails');
  const afterFailure = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(afterFailure.report?.id, 990, 'the successful draft save created one server report');
  assert.equal(afterFailure.report?.status, 'draft', 'the report remains a draft until submission succeeds');
  assert.equal(afterFailure.report?.version, 1, 'the first server-saved draft version is retained');
  assert.deepEqual(afterFailure.draftVersions, [null], 'the initial draft has no prior server version');
  assert.equal(afterFailure.submitRequests, 1, 'the initial submit is attempted once');
  await page.screenshot({ path: '/tmp/xmt-daily-report-submit-failure.png', fullPage: false });

  const retrySuccess = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().includes('/api/daily-reports/990/submit') && response.status() === 200);
  await page.getByRole('button', { name: '提交日报', exact: true }).click();
  await retrySuccess;
  await page.getByText('已提交', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').filter({ hasText: '日报草稿已保存，但提交失败' }).count(), 0, 'successful retry clears the persistent submit warning');
  assert.equal(await page.getByText('日报草稿已保存，尚未提交', { exact: true }).count(), 0, 'successful retry must not leave a stale global failure notice beside the success message');
  await page.getByText('提交成功', { exact: true }).waitFor();
  const afterRetry = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.deepEqual(afterRetry.draftVersions, [null, 1], 'the retry saves against the confirmed server version, not the stale initial version');
  assert.equal(afterRetry.draftRequests, 2, 'retry updates the same report instead of creating a duplicate');
  assert.equal(afterRetry.submitRequests, 2, 'the user-triggered retry makes one new submit request');
  assert.equal(afterRetry.report?.id, afterFailure.report.id, 'both attempts operate on the same report');
  assert.equal(afterRetry.report?.status, 'submitted', 'the report is submitted after a successful retry');
  await page.screenshot({ path: '/tmp/xmt-daily-report-submit-recovered.png', fullPage: false });
  await page.getByRole('button', { name: '我的日报', exact: true }).click();
  await page.getByLabel('记录类型').selectOption('monthly');
  const monthlySummary = page.getByLabel('工作总结');
  await monthlySummary.waitFor();
  await page.waitForFunction(() => {
    const field = Array.from(document.querySelectorAll('textarea')).find((element) => element.getAttribute('aria-label') === '工作总结'
      || element.labels?.[0]?.textContent?.includes('工作总结'));
    return Boolean(field && !field.disabled);
  });
  await monthlySummary.fill('月报失败重试保留的文字');
  const firstSummaryFailure = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().includes('/api/report-summaries/monthly') && response.status() === 503);
  const summarySubmit = page.getByRole('button', { name: '提交月报', exact: true }).dblclick();
  await page.waitForRequest((request) => request.method() === 'PUT'
    && request.url().includes('/api/report-summaries/monthly'));
  await page.getByRole('button', { name: '提交中', exact: true }).waitFor();
  assert.equal(await monthlySummary.isDisabled(), true, 'monthly content is locked while the server is saving');
  assert.equal(await page.getByLabel('年份').isDisabled(), true, 'the year cannot change during a pending summary save');
  assert.equal(await page.getByLabel('月份').isDisabled(), true, 'the month cannot change during a pending summary save');
  await summarySubmit;
  await firstSummaryFailure;
  await page.getByText('提交月报失败', { exact: true }).waitFor();
  assert.equal(await monthlySummary.isDisabled(), false, 'failed summary save restores editing');
  assert.equal(await monthlySummary.inputValue(), '月报失败重试保留的文字', 'failed summary save retains the submitted text');
  assert.equal(summaryWriteRequests, 1, 'a double click sends one monthly summary write');
  const summaryRetry = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().includes('/api/report-summaries/monthly') && response.status() === 200);
  await page.getByRole('button', { name: '提交月报', exact: true }).click();
  await summaryRetry;
  assert.equal(summaryWriteRequests, 2, 'the explicit retry sends one additional monthly summary write');
  await page.getByLabel('记录类型').selectOption('yearly');
  const yearlySummary = page.getByLabel('年度总结');
  await yearlySummary.waitFor();
  await yearlySummary.fill('年度报告保存中的内容');
  const yearlyWrite = page.waitForRequest((request) => request.method() === 'PUT'
    && request.url().includes('/api/report-summaries/yearly'));
  const yearlySubmit = page.getByRole('button', { name: '提交年报', exact: true }).dblclick();
  await yearlyWrite;
  await page.getByRole('button', { name: '提交中', exact: true }).waitFor();
  assert.equal(await yearlySummary.isDisabled(), true, 'yearly content is locked while the server is saving');
  assert.equal(await page.getByLabel('年份').isDisabled(), true, 'the yearly scope cannot change during a pending save');
  await yearlySubmit;
  await page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().includes('/api/report-summaries/yearly') && response.status() === 200);
  assert.equal(yearlyWriteRequests, 1, 'a double click sends one yearly summary write');
  await page.getByRole('button', { name: '总结归档', exact: true }).click();
  await page.getByRole('heading', { name: '总结归档', exact: true }).waitFor();
  const userDirectoryAlert = page.getByRole('alert').filter({ hasText: '成员名单加载失败' });
  await userDirectoryAlert.waitFor();
  await page.screenshot({ path: '/tmp/xmt-daily-report-member-list-retry.png', fullPage: false });
  const initialDirectoryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(initialDirectoryState.userDirectoryRequests, 1, 'the member directory failure is surfaced after one scoped read');
  const userDirectoryRetry = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/users') && response.status() === 200);
  await userDirectoryAlert.getByRole('button', { name: '重试', exact: true }).click();
  await userDirectoryRetry;
  assert.equal(await userDirectoryAlert.count(), 0, 'a successful member-directory retry clears the warning');
  await page.waitForFunction(() => Array.from(document.querySelector<HTMLSelectElement>('[data-testid="daily-report-archive-user-filter"]')?.options || [])
    .some((option) => option.textContent?.includes('日报恢复验收')));
  const directoryRetryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(directoryRetryState.userDirectoryRequests, 2, 'the explicit retry reloads only the member directory');
  for (const label of ['草稿', '已提交', '已审核', '已退回', '已归档', '状态待确认']) {
    await page.getByText(label, { exact: true }).waitFor();
  }
  assert.equal(await page.getByText('constructor', { exact: true }).count(), 0, 'archive rows must safely label unknown inherited-property names');
  await page.screenshot({ path: '/tmp/xmt-daily-report-archive-status-labels.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('已退回', { exact: true }).waitFor();
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
  assert.equal(mobileOverflow, false, 'the daily-report archive status list has no horizontal overflow at 390px');
  await page.screenshot({ path: '/tmp/xmt-daily-report-archive-status-labels-390.png', fullPage: false });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: '月报', exact: true }).click();
  await page.getByRole('button', { name: /完整工作总结/ }).click();
  const monthlyDialog = page.getByRole('dialog', { name: '月报详情' });
  await monthlyDialog.waitFor();
  for (const value of ['完整工作总结', '完整重点项目', '完整问题与计划']) {
    await monthlyDialog.getByText(value, { exact: true }).waitFor();
  }
  await monthlyDialog.screenshot({ path: '/tmp/xmt-summary-archive-monthly-details.png' });
  await monthlyDialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await monthlyDialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '年报', exact: true }).click();
  await page.getByRole('button', { name: /完整年度总结/ }).click();
  const yearlyDialog = page.getByRole('dialog', { name: '年报详情' });
  await yearlyDialog.waitFor();
  for (const value of ['完整年度总结', '完整主要成果', '未填写', '完整下一年度计划']) {
    await yearlyDialog.getByText(value, { exact: true }).waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const yearlyCloseButton = yearlyDialog.getByRole('button', { name: '关闭弹窗', exact: true });
  const closeBounds = await yearlyCloseButton.boundingBox();
  assert.ok(closeBounds && closeBounds.x >= 0 && closeBounds.x + closeBounds.width <= 390, 'the yearly detail close action remains reachable at 390px');
  await yearlyDialog.screenshot({ path: '/tmp/xmt-summary-archive-yearly-details-390.png' });
  await yearlyCloseButton.click();
  await yearlyDialog.waitFor({ state: 'hidden' });
  const afterArchiveRead = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(afterArchiveRead.draftRequests, afterRetry.draftRequests, 'viewing summary archives must not save a draft');
  assert.equal(afterArchiveRead.submitRequests, afterRetry.submitRequests, 'viewing summary archives must not submit a report');
  assert.deepEqual(unexpectedErrors, [], 'the isolated desktop report flow renders without unexpected browser errors');
  assert.equal(expectedHttpErrors.length, 3, 'browser HTTP errors are limited to the injected daily, summary, and member-directory failures');
  await context.close();
  console.log('Daily Report browser test passed: safe submit recovery, accurate archive statuses, and complete read-only monthly/yearly detail dialogs on desktop and mobile.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
