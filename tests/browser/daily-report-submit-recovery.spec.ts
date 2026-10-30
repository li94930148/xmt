import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const identityUserA = { ...user, id: 954, username: 'daily-report-account-a', role: 'member', name: '旧账号日报验收' };
const identityUserB = { ...user, id: 955, username: 'daily-report-account-b', role: 'member', name: '新账号日报验收' };
const reportDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const longSummaryText = (label: string, lines = 48) => Array.from({ length: lines }, (_, index) => `${label} 第 ${index + 1} 行`).join('\n');
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

const detailReport: FixtureReport = {
  id: 1001,
  userId: user.id,
  userName: '日报详情验收成员',
  reportDate,
  status: 'submitted',
  manualSummaryMd: '',
  riskLevel: 'normal',
  version: 1,
  items: Array.from({ length: 12 }, (_, index) => ({
    id: 1010 + index,
    sectionKey: `detail-section-${index + 1}`,
    title: `日报长内容区 ${index + 1}`,
    contentMd: `这是第 ${index + 1} 项日报详情，用于验证小屏抽屉内部滚动。${'今日完成内容与协作事项。'.repeat(18)}`,
    sortOrder: index,
  })),
};

let report: FixtureReport | null = null;
let fixtureUser = user;
let draftVersions: Array<number | null> = [];
let draftPayloads: unknown[] = [];
let draftRequests = 0;
let submitRequests = 0;
let failNextSubmit = true;
let failNextDraftAfterCommit = false;
let failNextDraftBeforeCommit = false;
let failNextDraftConflict = false;
let failFirstDraftRecoveryRead = false;
let draftSaveResponseFailed = false;
let failSubmitAfterCommit = false;
let failFirstReconciliationRead = false;
let committedSubmitResponseFailed = false;
let dailyReportReadRequests = 0;
let summaryWriteRequests = 0;
let failNextSummaryWrite = true;
let yearlyWriteRequests = 0;
let failNextSummaryStatus = 0;
let failNextSummaryRead = false;
let failNextSummaryArchive = false;
let commitThenFailNextSummaryWrite = false;
let conflictNextSummaryWrite = false;
let summaryFingerprintSequence = 1;
const summaryRecords = new Map<string, Record<string, unknown>>();
const summaryReceipts = new Map<string, { actorId: number; kind: 'monthly' | 'yearly'; year: number; month: number; fingerprint: string; data: Record<string, unknown> }>();
const summaryWriteBodies: Array<{ kind: 'monthly' | 'yearly'; year: number; month: number; body: Record<string, unknown> }> = [];
let userDirectoryRequests = 0;
let failNextUserDirectoryRead = true;

function summaryKey(kind: 'monthly' | 'yearly', year: number, month: number) {
  return `${fixtureUser.id}:${kind}:${year}:${month}`;
}

function summaryDigest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function currentSummaryBaseline(kind: 'monthly' | 'yearly', year: number, month: number) {
  const row = summaryRecords.get(summaryKey(kind, year, month));
  return typeof row?.baseline_fingerprint === 'string'
    ? row.baseline_fingerprint
    : summaryDigest(['no-row', fixtureUser.id, kind, year, kind === 'monthly' ? month : 0]);
}

function emptySummary(kind: 'monthly' | 'yearly', year: number, month: number) {
  return kind === 'monthly'
    ? { year, month, work_summary_md: '', key_projects_md: '', issues_plan_md: '', display_content_md: '', baseline_fingerprint: currentSummaryBaseline(kind, year, month) }
    : { year, annual_summary_md: '', achievements_md: '', shortcomings_md: '', next_year_plan_md: '', display_content_md: '', baseline_fingerprint: currentSummaryBaseline(kind, year, month) };
}

function summaryRequestFingerprint(kind: 'monthly' | 'yearly', year: number, month: number, body: Record<string, unknown>) {
  const fields = kind === 'monthly'
    ? ['content_md', 'work_summary_md', 'key_projects_md', 'issues_plan_md']
    : ['content_md', 'annual_summary_md', 'achievements_md', 'shortcomings_md', 'next_year_plan_md'];
  const payloadFingerprint = summaryDigest([kind, year, kind === 'monthly' ? month : 0, fields.map((field) => String(body[field] ?? ''))]);
  return summaryDigest([String(body.base_fingerprint || '').toLowerCase(), payloadFingerprint]);
}

function resetFixture() {
  fixtureUser = user;
  report = null;
  draftVersions = [];
  draftPayloads = [];
  draftRequests = 0;
  submitRequests = 0;
  failNextSubmit = true;
  failNextDraftAfterCommit = false;
  failNextDraftBeforeCommit = false;
  failNextDraftConflict = false;
  failFirstDraftRecoveryRead = false;
  draftSaveResponseFailed = false;
  failSubmitAfterCommit = false;
  failFirstReconciliationRead = false;
  committedSubmitResponseFailed = false;
  dailyReportReadRequests = 0;
  summaryWriteRequests = 0;
  failNextSummaryWrite = true;
  yearlyWriteRequests = 0;
  failNextSummaryStatus = 0;
  failNextSummaryRead = false;
  failNextSummaryArchive = false;
  commitThenFailNextSummaryWrite = false;
  conflictNextSummaryWrite = false;
  summaryFingerprintSequence = 1;
  summaryRecords.clear();
  summaryReceipts.clear();
  summaryWriteBodies.length = 0;
  userDirectoryRequests = 0;
  failNextUserDirectoryRead = true;
}

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  resetFixture();
  if (req.query.skipInitialSummaryFailure === '1') failNextSummaryWrite = false;
  if (req.query.skipInitialSubmitFailure === '1') failNextSubmit = false;
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','daily-report-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});if(${req.query.clearSummaryRecovery === '1'}){for(const storage of [localStorage,sessionStorage]){storage.removeItem('xmt:report-summary-update:pending:actor:${user.id}');storage.removeItem('xmt:report-summary-update:pending:actor:${user.id}:rejected')}}location.replace('/daily-report');</script>`);
});
app.get('/__qa/daily-detail', (_req, res) => {
  resetFixture();
  fixtureUser = user;
  report = detailReport;
  failNextSubmit = false;
  failNextUserDirectoryRead = false;
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','daily-report-detail-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/daily-report');</script>`);
});
app.get('/__qa/daily-identity', (_req, res) => {
  resetFixture();
  fixtureUser = identityUserA;
  report = {
    id: 980,
    userId: identityUserA.id,
    userName: identityUserA.name,
    reportDate,
    status: 'draft',
    manualSummaryMd: '',
    riskLevel: 'normal',
    version: 1,
    items: [{ id: 981, sectionKey: 'today', title: '今日工作', contentMd: '迟到的旧账号日报内容', sortOrder: 0 }],
  };
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(identityUserA))});localStorage.setItem('xmt_token','daily-report-account-a-token');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/daily-report');</script>`);
});
app.get('/__qa/submit-committed-error', (req, res) => {
  resetFixture();
  failNextSubmit = false;
  failSubmitAfterCommit = true;
  failFirstReconciliationRead = req.query.reconcile === 'retry';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','daily-report-ambiguous-submit-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/daily-report');</script>`);
});
app.get('/__qa/draft-commit-then-timeout', (req, res) => {
  resetFixture();
  failNextSubmit = false;
  failNextDraftAfterCommit = true;
  failFirstDraftRecoveryRead = req.query.reconcile === 'retry';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','daily-report-draft-ambiguous-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/daily-report');</script>`);
});
app.get('/__qa/draft-not-committed', (_req, res) => {
  resetFixture();
  failNextSubmit = false;
  failNextDraftBeforeCommit = true;
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','daily-report-draft-no-commit-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/daily-report');</script>`);
});
app.get('/__qa/draft-conflict', (_req, res) => {
  resetFixture();
  failNextSubmit = false;
  failNextDraftConflict = true;
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','daily-report-draft-conflict-fixture');localStorage.setItem('xmt_theme','light');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/daily-report');</script>`);
});
app.post('/__qa/fail-next-summary-status', (_req, res) => { failNextSummaryStatus += 1; res.json({ ok: true }); });
app.post('/__qa/fail-next-summary-read', (_req, res) => { failNextSummaryRead = true; res.json({ ok: true }); });
app.post('/__qa/fail-next-summary-archive', (_req, res) => { failNextSummaryArchive = true; res.json({ ok: true }); });
app.post('/__qa/commit-then-fail-next-summary-write', (_req, res) => { commitThenFailNextSummaryWrite = true; res.json({ ok: true }); });
app.post('/__qa/conflict-next-summary-write', (_req, res) => { conflictNextSummaryWrite = true; res.json({ ok: true }); });
app.get('/__qa/state', (_req, res) => res.json({ report, draftVersions, draftPayloads, draftRequests, submitRequests, failNextSubmit, userDirectoryRequests, dailyReportReadRequests, summaryWriteRequests, yearlyWriteRequests, summaryWriteBodies, summaryRecords: Array.from(summaryRecords.values()), summaryReceipts: Array.from(summaryReceipts.entries()).map(([id, receipt]) => ({ id, ...receipt })) }));
app.get('/api/auth/me', (_req, res) => res.json(fixtureUser));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/users', (_req, res) => {
  userDirectoryRequests += 1;
  if (failNextUserDirectoryRead) {
    failNextUserDirectoryRead = false;
    return res.status(503).json({ success: false, message: '模拟成员名单读取失败' });
  }
  return res.json({ success: true, data: [{ ...fixtureUser, created_at: '2026-01-01T00:00:00.000Z' }] });
});
app.get('/api/daily-reports/me', async (_req, res) => {
  dailyReportReadRequests += 1;
  if (draftSaveResponseFailed && failFirstDraftRecoveryRead) {
    failFirstDraftRecoveryRead = false;
    draftSaveResponseFailed = false;
    return res.status(503).json({ success: false, message: '模拟草稿保存后状态核实读取失败' });
  }
  if (committedSubmitResponseFailed && failFirstReconciliationRead) {
    failFirstReconciliationRead = false;
    return res.status(503).json({ success: false, message: '模拟提交后状态核实读取失败' });
  }
  const response = {
    success: true,
    data: {
      reportDate,
      template: { id: null, name: '默认模板', description: '', sections: [] },
      report: report ? { ...report, items: report.items.map((item) => ({ ...item })) } : null,
      canCreate: true,
    },
  };
  return res.json(response);
});
app.post('/api/daily-reports/draft', async (req, res) => {
  draftRequests += 1;
  const submittedVersion = typeof req.body?.version === 'number' ? req.body.version : null;
  draftVersions.push(submittedVersion);
  draftPayloads.push(JSON.parse(JSON.stringify(req.body)));
  if (failNextDraftConflict) {
    failNextDraftConflict = false;
    return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: '日报版本已变化，请刷新后再保存' });
  }
  if (failNextDraftBeforeCommit) {
    failNextDraftBeforeCommit = false;
    return res.status(503).json({ success: false, message: '模拟草稿未提交后响应异常' });
  }
  if (report && submittedVersion !== report.version) {
    return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: '日报版本已变化，请刷新后再保存' });
  }
  report = {
    id: report?.id ?? 990,
    userId: fixtureUser.id,
    userName: fixtureUser.name,
    reportDate,
    status: 'draft',
    manualSummaryMd: req.body?.manualSummaryMd ?? '',
    riskLevel: 'normal',
    version: (report?.version ?? 0) + 1,
    items: req.body?.items ?? [],
  };
  if (failNextDraftAfterCommit) {
    failNextDraftAfterCommit = false;
    draftSaveResponseFailed = true;
    return res.status(503).json({ success: false, message: '模拟草稿已保存但响应丢失' });
  }
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
  if (failSubmitAfterCommit) {
    failSubmitAfterCommit = false;
    committedSubmitResponseFailed = true;
    return res.status(503).json({ success: false, message: '模拟已提交但响应丢失' });
  }
  return res.json({ success: true, data: report });
});
app.get('/api/daily-reports/team', (_req, res) => res.json({ success: true, data: {
  reportDate,
  status: 'submitted',
  reports: [detailReport],
} }));
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
    items: index === 0 ? [{ ...detailReport.items[0], contentMd: '归档日报的只读详情内容。' }] : [],
  })),
} }));
app.get('/api/report-summaries/archive', (req, res) => {
  if (failNextSummaryArchive) {
    failNextSummaryArchive = false;
    return res.status(503).json({ success: false, message: 'Internal Server Error' });
  }
  const year = Number(req.query.year);
  return res.json({ success: true, data: {
    year,
    monthly: [{
      id: 997, year, month: 8, user_name: user.name,
      work_summary_md: longSummaryText('完整工作总结'), key_projects_md: longSummaryText('完整重点项目'), issues_plan_md: longSummaryText('完整问题与计划'),
      display_content_md: '完整工作总结', created_at: `${year}-08-01T00:00:00.000Z`, updated_at: `${year}-08-02T00:00:00.000Z`,
    }],
    yearly: [{
      id: 998, year, user_name: user.name,
      annual_summary_md: longSummaryText('完整年度总结'), achievements_md: longSummaryText('完整主要成果'), shortcomings_md: '', next_year_plan_md: longSummaryText('完整下一年度计划'),
      display_content_md: '完整年度总结',
    }],
  } });
});
app.use(['/api/report-summaries/monthly/requests/:requestId', '/api/report-summaries/yearly/requests/:requestId'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.get('/api/report-summaries/monthly/requests/:requestId', (req, res) => {
  if (failNextSummaryStatus > 0) {
    failNextSummaryStatus -= 1;
    return res.status(503).json({ success: false, message: 'Internal Server Error' });
  }
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const receipt = summaryReceipts.get(String(req.params.requestId).toLowerCase());
  if (!receipt || receipt.actorId !== fixtureUser.id || receipt.kind !== 'monthly' || receipt.year !== year || receipt.month !== month) return res.json({ status: 'not_found' });
  if (receipt.fingerprint !== req.query.fingerprint) return res.status(409).json({ status: 'conflict', code: 'REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT' });
  return res.json({ status: 'processed', data: receipt.data });
});
app.get('/api/report-summaries/yearly/requests/:requestId', (req, res) => {
  if (failNextSummaryStatus > 0) {
    failNextSummaryStatus -= 1;
    return res.status(503).json({ success: false, message: 'Internal Server Error' });
  }
  const year = Number(req.query.year);
  const receipt = summaryReceipts.get(String(req.params.requestId).toLowerCase());
  if (!receipt || receipt.actorId !== fixtureUser.id || receipt.kind !== 'yearly' || receipt.year !== year) return res.json({ status: 'not_found' });
  if (receipt.fingerprint !== req.query.fingerprint) return res.status(409).json({ status: 'conflict', code: 'REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT' });
  return res.json({ status: 'processed', data: receipt.data });
});

app.get('/api/report-summaries/monthly', (req, res) => {
  if (failNextSummaryRead) {
    failNextSummaryRead = false;
    return res.status(503).json({ success: false, message: 'Internal Server Error' });
  }
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const data = summaryRecords.get(summaryKey('monthly', year, month)) || emptySummary('monthly', year, month);
  return res.json({ success: true, data });
});
app.get('/api/report-summaries/yearly', (req, res) => {
  const year = Number(req.query.year);
  const data = summaryRecords.get(summaryKey('yearly', year, 0)) || emptySummary('yearly', year, 0);
  return res.json({ success: true, data });
});

async function saveSummary(kind: 'monthly' | 'yearly', req: express.Request, res: express.Response) {
  const year = Number(req.query.year);
  const month = kind === 'monthly' ? Number(req.query.month) : 0;
  if (kind === 'monthly') summaryWriteRequests += 1;
  else yearlyWriteRequests += 1;
  const body = structuredClone(req.body || {}) as Record<string, unknown>;
  summaryWriteBodies.push({ kind, year, month, body });
  await new Promise<void>((resolve) => setTimeout(resolve, 150));
  const requestId = typeof body.client_request_id === 'string' ? body.client_request_id.toLowerCase() : '';
  const fingerprint = summaryRequestFingerprint(kind, year, month, body);
  const existing = requestId ? summaryReceipts.get(requestId) : undefined;
  if (existing) {
    if (existing.actorId !== fixtureUser.id || existing.kind !== kind || existing.year !== year || existing.month !== month || existing.fingerprint !== fingerprint) {
      return res.status(409).json({ success: false, code: 'REPORT_SUMMARY_UPDATE_REQUEST_CONFLICT', message: '总结更新请求编号冲突' });
    }
    return res.json({ success: true, data: existing.data });
  }
  if (conflictNextSummaryWrite) {
    conflictNextSummaryWrite = false;
    const nextBaseline = summaryDigest(['external', fixtureUser.id, kind, year, month, summaryFingerprintSequence++]);
    const changed = kind === 'monthly'
      ? { ...emptySummary('monthly', year, month), work_summary_md: '服务器外部新版本', baseline_fingerprint: nextBaseline }
      : { ...emptySummary('yearly', year, 0), annual_summary_md: '服务器外部新版本', baseline_fingerprint: nextBaseline };
    summaryRecords.set(summaryKey(kind, year, month), changed);
    return res.status(409).json({ success: false, code: 'REPORT_SUMMARY_UPDATE_BASE_CONFLICT', message: '总结内容已被其他操作更新' });
  }
  if (body.base_fingerprint !== currentSummaryBaseline(kind, year, month)) {
    return res.status(409).json({ success: false, code: 'REPORT_SUMMARY_UPDATE_BASE_CONFLICT', message: '总结内容已被其他操作更新' });
  }
  if (failNextSummaryWrite) {
    failNextSummaryWrite = false;
    return res.status(503).json({ success: false, message: '模拟月报提交失败' });
  }
  const fields = kind === 'monthly'
    ? ['work_summary_md', 'key_projects_md', 'issues_plan_md']
    : ['annual_summary_md', 'achievements_md', 'shortcomings_md', 'next_year_plan_md'];
  const values = Object.fromEntries(fields.map((field) => [field, String(body[field] ?? '')]));
  const data = {
    year,
    ...(kind === 'monthly' ? { month } : {}),
    ...values,
    content_md: '',
    display_content_md: String(values[kind === 'monthly' ? 'work_summary_md' : 'annual_summary_md'] || ''),
    baseline_fingerprint: summaryDigest(['row', fixtureUser.id, kind, year, month, summaryFingerprintSequence++]),
  };
  summaryRecords.set(summaryKey(kind, year, month), data);
  if (requestId) summaryReceipts.set(requestId, { actorId: fixtureUser.id, kind, year, month, fingerprint, data: structuredClone(data) });
  if (commitThenFailNextSummaryWrite) {
    commitThenFailNextSummaryWrite = false;
    return res.status(503).json({ success: false, message: '模拟月报已保存但响应丢失' });
  }
  return res.json({ success: true, data });
}
app.put('/api/report-summaries/monthly', (req, res) => saveSummary('monthly', req, res));
app.put('/api/report-summaries/yearly', (req, res) => saveSummary('yearly', req, res));
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

async function assertSummaryArchiveDialogLifecycle(
  page: import('playwright').Page,
  title: '月报详情' | '年报详情',
  trigger: import('playwright').Locator,
  viewport: { width: number; height: number },
) {
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('aria-modal'), 'true', `${title} exposes modal dialog semantics`);

  const closeButton = dialog.getByRole('button', { name: '关闭弹窗', exact: true });
  const closeBounds = await closeButton.boundingBox();
  assert.ok(closeBounds && closeBounds.width >= 40 && closeBounds.height >= 40,
    `${title} close target is at least 40×40 CSS pixels: ${JSON.stringify(closeBounds)}`);
  assert.equal(await closeButton.evaluate((element) => element === document.activeElement), true,
    `${title} moves initial focus into the dialog`);

  const panelBounds = await dialog.locator(':scope > div').boundingBox();
  assert.ok(panelBounds
    && panelBounds.x >= 0
    && panelBounds.y >= 0
    && panelBounds.x + panelBounds.width <= viewport.width + 1
    && panelBounds.y + panelBounds.height <= viewport.height + 1,
  `${title} panel stays within ${viewport.width}×${viewport.height}: ${JSON.stringify(panelBounds)}`);
  const pageWidths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  assert.ok(pageWidths.document <= pageWidths.viewport,
    `${title} does not create horizontal page overflow: ${JSON.stringify(pageWidths)}`);

  const backgroundState = async () => page.locator('#root').evaluate((element) => ({
    inert: (element as HTMLElement).inert,
    ariaHidden: element.getAttribute('aria-hidden'),
  }));
  assert.deepEqual(await backgroundState(), { inert: true, ariaHidden: 'true' },
    `${title} isolates the mounted application behind the dialog`);

  await page.keyboard.press('Tab');
  assert.equal(await closeButton.evaluate((element) => element === document.activeElement), true,
    `${title} keeps Tab within its only focusable control`);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await closeButton.evaluate((element) => element === document.activeElement), true,
    `${title} keeps Shift+Tab within its only focusable control`);

  const content = dialog.locator('.overflow-y-auto').first();
  const scrollMetrics = await content.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  assert.ok(scrollMetrics.scrollHeight > scrollMetrics.clientHeight,
    `${title} long content scrolls inside the modal at ${viewport.width}×${viewport.height}: ${JSON.stringify(scrollMetrics)}`);
  assert.ok(scrollMetrics.scrollWidth <= scrollMetrics.clientWidth,
    `${title} long content wraps within the modal: ${JSON.stringify(scrollMetrics)}`);
  await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  assert.ok(await content.evaluate((element) => element.scrollTop > 0), `${title} internal content area can be scrolled`);

  await closeButton.click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true,
    `${title} restores focus to its archive row after close`);
  assert.deepEqual(await backgroundState(), { inert: false, ariaHidden: null },
    `${title} restores the application background after close`);
}

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
    if (message.text().includes('503 (Service Unavailable)') || message.text().includes('409 (Conflict)')) expectedHttpErrors.push(message.text());
    else unexpectedErrors.push(message.text());
  });

  const storageDropPage = await context.newPage();
  storageDropPage.setDefaultTimeout(5000);
  const desktopRecoveryKey = `xmt:daily-report-draft-recovery:v1:${user.id}:${reportDate}`;
  await storageDropPage.addInitScript((key) => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === window.sessionStorage && name === key) return;
      nativeSetItem.call(this, name, value);
    };
  }, desktopRecoveryKey);
  await storageDropPage.goto(`${base}/__qa`);
  await storageDropPage.getByRole('heading', { name: '日报' }).waitFor();
  const storageDropEditor = storageDropPage.getByPlaceholder('记录今天完成或推进的工作');
  await storageDropEditor.fill('浏览器静默丢弃恢复凭证时保留输入');
  await storageDropPage.getByRole('button', { name: '提交日报', exact: true }).click();
  await storageDropPage.getByRole('alert').filter({ hasText: '日报未保存' }).waitFor();
  assert.equal(await storageDropEditor.inputValue(), '浏览器静默丢弃恢复凭证时保留输入', 'desktop retains the report text when session storage silently drops the recovery marker');
  assert.equal(await storageDropPage.evaluate((key) => sessionStorage.getItem(key), desktopRecoveryKey), null, 'the injected desktop session-storage drop leaves no recovery marker');
  const storageDropState = await storageDropPage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(storageDropState.draftRequests, 0, 'desktop does not send a draft write when the recovery marker cannot be read back');
  assert.equal(storageDropState.submitRequests, 0, 'desktop does not submit when the recovery marker cannot be read back');
  await storageDropPage.close();

  const cleanupFailurePage = await context.newPage();
  cleanupFailurePage.setDefaultTimeout(5000);
  await cleanupFailurePage.addInitScript((key) => {
    const nativeRemoveItem = Storage.prototype.removeItem;
    let failFirstRemoval = true;
    Storage.prototype.removeItem = function (name) {
      if (this === window.sessionStorage && name === key && failFirstRemoval) {
        failFirstRemoval = false;
        throw new DOMException('模拟恢复记录清理失败', 'QuotaExceededError');
      }
      nativeRemoveItem.call(this, name);
    };
  }, desktopRecoveryKey);
  await cleanupFailurePage.goto(`${base}/__qa`);
  await cleanupFailurePage.getByRole('heading', { name: '日报' }).waitFor();
  await cleanupFailurePage.getByPlaceholder('记录今天完成或推进的工作').fill('草稿确认后恢复记录清理失败');
  const firstDraftSaved = cleanupFailurePage.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/daily-reports/draft') && response.status() === 200);
  await cleanupFailurePage.getByRole('button', { name: '提交日报', exact: true }).click();
  await firstDraftSaved;
  await cleanupFailurePage.getByRole('alert').filter({ hasText: '日报草稿已保存，但本机恢复记录未能清除' }).waitFor();
  const stateAfterCleanupFailure = await cleanupFailurePage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(stateAfterCleanupFailure.report?.status, 'draft', 'the confirmed draft remains a draft when its recovery marker cannot be cleared');
  assert.equal(stateAfterCleanupFailure.draftRequests, 1, 'a confirmed save is not repeated while recovery cleanup is blocked');
  assert.equal(stateAfterCleanupFailure.submitRequests, 0, 'submission waits until the saved-draft recovery marker is cleared');
  assert.equal(await cleanupFailurePage.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || 'null')?.phase, desktopRecoveryKey), 'saved',
    'the retained marker records that the server confirmed the draft save');
  const submitAfterCleanupRetry = cleanupFailurePage.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().includes('/api/daily-reports/990/submit') && response.status() === 200);
  await cleanupFailurePage.getByRole('button', { name: '提交日报', exact: true }).click();
  await submitAfterCleanupRetry;
  assert.equal(await cleanupFailurePage.evaluate((key) => sessionStorage.getItem(key), desktopRecoveryKey), null,
    'the marker is removed before the later successful submit');
  const stateAfterCleanupRetry = await cleanupFailurePage.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(stateAfterCleanupRetry.draftRequests, 1, 'retrying cleanup does not save the same draft twice');
  assert.equal(stateAfterCleanupRetry.submitRequests, 1, 'submit is sent once after recovery cleanup succeeds');
  assert.equal(stateAfterCleanupRetry.report?.status, 'submitted', 'the report is submitted after the marker is safely removed');
  await cleanupFailurePage.close();

  const recoveryRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/daily-reports/')) recoveryRequests.push(request.method());
  });

  await page.goto(`${base}/__qa/draft-commit-then-timeout?reconcile=retry`);
  await page.getByRole('heading', { name: '日报' }).waitFor();
  for (const field of [page.getByLabel('记录类型'), page.getByPlaceholder('记录今天完成或推进的工作'), page.getByPlaceholder('记录明天准备开展的工作'), page.getByPlaceholder('记录需要他人或团队协助的事项')]) {
    const identity = await field.evaluate((element) => ({ id: element.id, name: element.getAttribute('name') }));
    assert.ok(identity.id && identity.name, 'daily report controls expose stable ids and names for browser autofill');
  }
  const reportViewNavigation = page.getByRole('navigation', { name: '日报视图' });
  assert.equal(await reportViewNavigation.count(), 1, 'daily report views are exposed in a named navigation landmark');
  const mineTab = reportViewNavigation.getByRole('button', { name: '我的日报', exact: true });
  const teamTab = reportViewNavigation.getByRole('button', { name: '团队日报', exact: true });
  const archiveTab = reportViewNavigation.getByRole('button', { name: '总结归档', exact: true });
  assert.equal(await reportViewNavigation.getByRole('button').count(), 3, 'the named daily report navigation contains the visible view choices');
  assert.equal(await mineTab.getAttribute('aria-pressed'), 'true', '我的日报 is selected by default');
  assert.equal(await teamTab.getAttribute('aria-pressed'), 'false', '团队日报 is exposed as unselected by default');
  assert.equal(await archiveTab.getAttribute('aria-pressed'), 'false', '总结归档 is exposed as unselected by default');
  await teamTab.click();
  assert.equal(await teamTab.getAttribute('aria-pressed'), 'true', '团队日报 exposes its selected state after activation');
  await archiveTab.click();
  assert.equal(await archiveTab.getAttribute('aria-pressed'), 'true', '总结归档 exposes its selected state after activation');
  await mineTab.click();
  assert.equal(await mineTab.getAttribute('aria-pressed'), 'true', '我的日报 exposes its selected state after returning');
  await page.goto(`${base}/__qa/draft-commit-then-timeout?reconcile=retry`);
  await page.getByRole('heading', { name: '日报' }).waitFor();
  const ambiguousDraftEditor = page.getByPlaceholder('记录今天完成或推进的工作');
  await ambiguousDraftEditor.fill('草稿已写入但响应丢失后刷新核验');
  const committedDraftResponseFailure = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/daily-reports/draft') && response.status() === 503);
  const firstDraftReadFailure = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/daily-reports/me') && response.status() === 503);
  await page.getByRole('button', { name: '提交日报', exact: true }).click();
  await committedDraftResponseFailure;
  await firstDraftReadFailure;
  const draftUnknownNotice = page.getByRole('alert').filter({ hasText: '草稿保存结果仍无法确认' });
  await draftUnknownNotice.waitFor();
  assert.equal(await ambiguousDraftEditor.isDisabled(), true, 'a draft write with an unknown result locks editing');
  assert.equal(await page.getByRole('button', { name: '状态待核实', exact: true }).isDisabled(), true, 'an unknown draft write cannot be submitted again');
  const afterAmbiguousDraft = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(afterAmbiguousDraft.report?.status, 'draft', 'the fixture committed the draft before losing its response');
  assert.equal(afterAmbiguousDraft.draftRequests, 1, 'the ambiguous initial draft save was sent once');
  assert.equal(afterAmbiguousDraft.submitRequests, 0, 'submission is not attempted until the draft save is confirmed');
  assert.equal(afterAmbiguousDraft.dailyReportReadRequests, 2, 'the first unknown-result recovery uses one read-only /me request');

  recoveryRequests.length = 0;
  const refreshedDraftRead = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/daily-reports/me') && response.status() === 200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await refreshedDraftRead;
  await page.getByRole('alert').filter({ hasText: '服务器已确认草稿保存成功' }).waitFor();
  assert.equal(await ambiguousDraftEditor.inputValue(), '草稿已写入但响应丢失后刷新核验', 'the original local payload survives refresh and is recovered from the matching server snapshot');
  assert.equal(await ambiguousDraftEditor.isDisabled(), false, 'a fully matching server draft unlocks the editor for review');
  assert.deepEqual(recoveryRequests, ['GET'], 'refreshing an unknown draft result performs only a read-only GET and no duplicate write');
  const afterRefreshRecovery = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(afterRefreshRecovery.draftRequests, 1, 'refresh recovery does not repeat the already-committed draft POST');
  assert.equal(afterRefreshRecovery.submitRequests, 0, 'refresh recovery does not submit automatically');
  await page.screenshot({ path: '/tmp/xmt-daily-report-draft-refresh-recovered.png', fullPage: false });

  await page.evaluate((key) => sessionStorage.removeItem(key), `xmt:daily-report-draft-recovery:v1:${user.id}:${reportDate}`);
  await page.goto(`${base}/__qa/draft-not-committed`);
  await page.getByRole('heading', { name: '日报' }).waitFor();
  const safeRetryEditor = page.getByPlaceholder('记录今天完成或推进的工作');
  const originalDraftText = '服务器仍为空时使用同一载荷显式重试';
  await safeRetryEditor.fill(originalDraftText);
  const initialUncommittedFailure = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/daily-reports/draft') && response.status() === 503);
  await page.getByRole('button', { name: '提交日报', exact: true }).click();
  await initialUncommittedFailure;
  const safeRetryNotice = page.getByRole('alert').filter({ hasText: '服务器确认日报仍是保存前状态' });
  await safeRetryNotice.waitFor();
  assert.equal(await safeRetryEditor.isDisabled(), true, 'the original editor remains locked until an explicit same-payload retry');
  const beforeExplicitRetry = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(beforeExplicitRetry.draftRequests, 1, 'an absent report does not trigger an automatic second POST');
  assert.equal(beforeExplicitRetry.dailyReportReadRequests, 2, 'safe retry eligibility is based on the initial read and one read-only verification');
  const samePayloadRetryResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/daily-reports/draft') && response.status() === 200);
  await safeRetryNotice.getByRole('button', { name: '同载荷安全重试', exact: true }).click();
  await samePayloadRetryResponse;
  await page.getByRole('alert').filter({ hasText: '服务器已确认草稿保存成功' }).waitFor();
  const afterExplicitRetry = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(afterExplicitRetry.draftRequests, 2, 'only the explicit retry sends the second draft POST');
  assert.deepEqual(afterExplicitRetry.draftVersions, [0, 0], 'both create attempts assert that no server version existed');
  assert.deepEqual(afterExplicitRetry.draftPayloads[1], afterExplicitRetry.draftPayloads[0], 'the retry resends the exact original payload');
  assert.equal(afterExplicitRetry.report?.items[0]?.contentMd, originalDraftText, 'the exact locally retained content is saved on explicit retry');
  assert.equal(afterExplicitRetry.submitRequests, 0, 'saving the explicitly retried draft does not implicitly submit it');
  const submitConfirmedDraft = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().includes('/api/daily-reports/990/submit') && response.status() === 200);
  await page.getByRole('button', { name: '提交日报', exact: true }).click();
  await submitConfirmedDraft;
  const afterSubmitConfirmedDraft = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(afterSubmitConfirmedDraft.draftRequests, 2, 'submitting a confirmed recovered draft does not save it a second time');
  assert.equal(afterSubmitConfirmedDraft.submitRequests, 1, 'submission is a separate explicit write after draft recovery');

  await page.goto(`${base}/__qa/draft-conflict`);
  await page.getByRole('heading', { name: '日报' }).waitFor();
  const conflictEditor = page.getByPlaceholder('记录今天完成或推进的工作');
  await conflictEditor.fill('真实版本冲突错误必须保留');
  const conflictResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && response.url().endsWith('/api/daily-reports/draft') && response.status() === 409);
  await page.getByRole('button', { name: '提交日报', exact: true }).click();
  await conflictResponse;
  await page.getByText('日报版本已变化，请刷新后再保存', { exact: true }).waitFor();
  assert.equal(await conflictEditor.isDisabled(), false, 'a known pre-write 409 is surfaced and does not leave the editor locked');
  const afterPreWriteConflict = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(afterPreWriteConflict.dailyReportReadRequests, 1, 'a known pre-write 409 does not trigger an unnecessary recovery read');
  assert.equal(afterPreWriteConflict.draftRequests, 1, 'the deterministic 409 is not retried automatically');
  assert.equal(afterPreWriteConflict.report, null, 'the conflict fixture leaves the server unchanged');

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
  const pendingControls = await page.evaluate(() => {
    const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="记录今天完成或推进的工作"]');
    const headerReadAction = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      ['刷新', '核实草稿', '核实状态', '核实中'].includes(button.innerText.trim()));
    return {
      inputLocked: Boolean(input?.disabled),
      headerReadActionFound: Boolean(headerReadAction),
      headerReadActionLocked: Boolean(headerReadAction?.disabled),
    };
  });
  await firstSubmitClick;
  await firstSubmitFailure;
  assert.equal(pendingControls.inputLocked, true, 'the draft input is locked while submission is pending so a late response cannot discard new typing');
  assert.equal(pendingControls.headerReadActionFound, true, 'the header read action remains present while a write is pending');
  assert.equal(pendingControls.headerReadActionLocked, true, 'a pending write cannot race with refreshing or verifying the old report');

  const warning = page.getByRole('alert').filter({ hasText: '日报草稿已保存，但提交失败' });
  await warning.waitFor();
  assert.equal(await editor.isDisabled(), false, 'a failed submit unlocks the retained draft for editing and retry');
  assert.match(await warning.innerText(), /服务器当前状态为“草稿”/);
  assert.match(await warning.innerText(), /已保存内容已保留，可检查后重新提交/);
  assert.equal(await page.getByText('日报草稿已保存，尚未提交', { exact: true }).count(), 0, 'the persistent in-page recovery notice should not be duplicated by a global warning toast');
  assert.equal(await editor.inputValue(), '完成日报草稿保存与提交分步恢复验收', 'the draft remains visible after the later submit request fails');
  const afterFailure = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(afterFailure.report?.id, 990, 'the successful draft save created one server report');
  assert.equal(afterFailure.report?.status, 'draft', 'the report remains a draft until submission succeeds');
  assert.equal(afterFailure.report?.version, 1, 'the first server-saved draft version is retained');
  assert.deepEqual(afterFailure.draftVersions, [0], 'the initial draft asserts that no server version existed');
  assert.equal(afterFailure.submitRequests, 1, 'the initial submit is attempted once');
  assert.equal(afterFailure.dailyReportReadRequests, 2, 'a failed submit is reconciled with one read-only report request');
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
  assert.deepEqual(afterRetry.draftVersions, [0, 1], 'the retry saves against the confirmed server version, not the stale initial version');
  assert.equal(afterRetry.draftRequests, 2, 'retry updates the same report instead of creating a duplicate');
  assert.equal(afterRetry.submitRequests, 2, 'the user-triggered retry makes one new submit request');
  assert.equal(afterRetry.report?.id, afterFailure.report.id, 'both attempts operate on the same report');
  assert.equal(afterRetry.report?.status, 'submitted', 'the report is submitted after a successful retry');
  await page.screenshot({ path: '/tmp/xmt-daily-report-submit-recovered.png', fullPage: false });
  await page.getByRole('button', { name: '我的日报', exact: true }).click();
  const summaryWritesBeforeReadFailure = await page.request.get(`${base}/__qa/state`).then((response) => response.json()).then((state) => state.summaryWriteRequests);
  await page.request.post(`${base}/__qa/fail-next-summary-read`);
  await page.getByLabel('记录类型').selectOption('monthly');
  const monthlySummary = page.getByLabel('工作总结');
  for (const field of [page.getByLabel('记录类型'), page.getByLabel('年份'), page.getByLabel('月份'), monthlySummary, page.getByLabel('重点项目'), page.getByLabel('问题与计划')]) {
    const identity = await field.evaluate((element) => ({ id: element.id, name: element.getAttribute('name') }));
    assert.ok(identity.id && identity.name, 'summary controls expose stable ids and names for browser autofill');
  }
  await page.getByRole('alert').getByText('加载总结失败，请检查连接后重试。', { exact: true }).waitFor();
  assert.equal(await page.getByText('Internal Server Error', { exact: true }).count(), 0, 'monthly summary load does not expose a raw technical response');
  assert.equal(await page.request.get(`${base}/__qa/state`).then((response) => response.json()).then((state) => state.summaryWriteRequests), summaryWritesBeforeReadFailure, 'a failed summary read does not write data');
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
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
  const monthlyRecovery = page.getByTestId('report-summary-recovery');
  await monthlyRecovery.filter({ hasText: '服务器尚未找到这次更新记录' }).waitFor();
  assert.equal(await page.getByRole('status').filter({ hasText: '正在保存月报' }).count(), 0,
    'the stale saving notice is cleared when the result is confirmed not_found');
  assert.equal(await monthlySummary.isDisabled(), true, 'an uncertain summary write stays locked until it is explicitly resolved');
  assert.equal(await monthlySummary.inputValue(), '月报失败重试保留的文字', 'an uncertain summary write retains the submitted text');
  assert.equal(summaryWriteRequests, 1, 'a double click sends one monthly summary write');
  const summaryBodiesBeforeRetry = await page.request.get(`${base}/__qa/state`).then((response) => response.json()).then((state) => state.summaryWriteBodies);
  assert.equal(summaryBodiesBeforeRetry.length, 1);
  assert.equal(summaryBodiesBeforeRetry[0].body.base_fingerprint,
    summaryDigest(['no-row', user.id, 'monthly', summaryBodiesBeforeRetry[0].year, summaryBodiesBeforeRetry[0].month]),
  'a first monthly summary uses the server no-row baseline fingerprint');
  const summaryRetry = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().includes('/api/report-summaries/monthly') && response.status() === 200);
  await monthlyRecovery.getByRole('button', { name: '使用原请求重试', exact: true }).click();
  await summaryRetry;
  const summaryBodiesAfterRetry = await page.request.get(`${base}/__qa/state`).then((response) => response.json()).then((state) => state.summaryWriteBodies);
  assert.equal(summaryBodiesAfterRetry.length, 2, 'the explicit retry sends one additional monthly summary write');
  assert.equal(summaryBodiesAfterRetry[1].body.client_request_id, summaryBodiesBeforeRetry[0].body.client_request_id, 'not_found retry uses the original UUID');
  assert.deepEqual(summaryBodiesAfterRetry[1].body, summaryBodiesBeforeRetry[0].body, 'not_found retry uses the exact original baseline and payload');
  assert.equal(summaryWriteRequests, 2);
  await page.getByRole('status').filter({ hasText: '月报已保存' }).waitFor();
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

  await page.goto(`${base}/__qa?clearSummaryRecovery=1&skipInitialSummaryFailure=1`);
  await page.getByRole('button', { name: '我的日报', exact: true }).click();
  await page.getByLabel('记录类型').selectOption('monthly');
  const recoveredMonthly = page.getByLabel('工作总结');
  await recoveredMonthly.waitFor();
  await page.waitForFunction(() => {
    const field = Array.from(document.querySelectorAll('textarea')).find((element) => element.labels?.[0]?.textContent?.includes('工作总结'));
    return Boolean(field && !field.disabled);
  });
  await page.evaluate(async () => {
    await fetch('/__qa/commit-then-fail-next-summary-write', { method: 'POST' });
    await fetch('/__qa/fail-next-summary-status', { method: 'POST' });
  });
  const lostSummaryText = '月报提交后响应丢失仍需刷新恢复的全文';
  await recoveredMonthly.fill(lostSummaryText);
  const committedSummaryError = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().includes('/api/report-summaries/monthly') && response.status() === 503);
  const firstSummaryStatusError = page.waitForResponse((response) => response.request().method() === 'GET'
    && response.url().includes('/api/report-summaries/monthly/requests/') && response.status() === 503);
  await page.getByRole('button', { name: '提交月报', exact: true }).click();
  await Promise.all([committedSummaryError, firstSummaryStatusError]);
  await page.getByTestId('report-summary-recovery').filter({ hasText: '暂时无法核实本次总结更新结果' }).waitFor();
  await page.getByTestId('report-summary-recovery').getByText('暂时无法核实总结保存结果', { exact: true }).waitFor();
  assert.equal(await page.getByText('Internal Server Error', { exact: true }).count(), 0, 'uncertain summary writes do not expose a raw status-check response');
  assert.equal(await page.getByRole('status').filter({ hasText: '正在保存月报' }).count(), 0,
    'the stale saving notice is cleared when status verification is unavailable');
  const pendingSummary = await page.evaluate(() => sessionStorage.getItem('xmt:report-summary-update:pending:actor:953'));
  assert.ok(pendingSummary, 'the monthly update marker is persisted before the keyed write');
  assert.equal(JSON.parse(pendingSummary).formSnapshot.work_summary_md, lostSummaryText, 'the complete original form is durable while the result is uncertain');
  const lostSummaryStateBeforeReload = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(lostSummaryStateBeforeReload.summaryWriteRequests, 1, 'the committed-but-error monthly write is sent once');
  assert.equal(lostSummaryStateBeforeReload.summaryReceipts.length, 1, 'the fixture recorded the committed summary before returning the ambiguous error');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '我的日报', exact: true }).click();
  await page.getByLabel('记录类型').selectOption('monthly');
  await page.getByRole('status').filter({ hasText: '月报已保存，已恢复本次保存内容' }).waitFor();
  assert.equal(await page.getByLabel('工作总结').inputValue(), lostSummaryText, 'status recovery restores the exact committed summary snapshot');
  const lostSummaryStateAfterReload = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(lostSummaryStateAfterReload.summaryWriteRequests, 1, 'refresh recovery does not repeat a committed PUT');
  assert.deepEqual(await page.evaluate(() => ({
    session: sessionStorage.getItem('xmt:report-summary-update:pending:actor:953'),
    local: localStorage.getItem('xmt:report-summary-update:pending:actor:953'),
  })), { session: null, local: null }, 'a processed update clears the recovery marker in both stores');

  await page.goto(`${base}/__qa?clearSummaryRecovery=1&skipInitialSummaryFailure=1`);
  await page.getByRole('button', { name: '我的日报', exact: true }).click();
  await page.getByLabel('记录类型').selectOption('monthly');
  const conflictedMonthly = page.getByLabel('工作总结');
  await conflictedMonthly.waitFor();
  await page.waitForFunction(() => {
    const field = Array.from(document.querySelectorAll('textarea')).find((element) => element.labels?.[0]?.textContent?.includes('工作总结'));
    return Boolean(field && !field.disabled);
  });
  await page.evaluate(async () => { await fetch('/__qa/conflict-next-summary-write', { method: 'POST' }); });
  const conflictedDraft = '需保留且不能覆盖服务器的月报草稿';
  await conflictedMonthly.fill(conflictedDraft);
  const summaryBaseConflict = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().includes('/api/report-summaries/monthly') && response.status() === 409);
  await page.getByRole('button', { name: '提交月报', exact: true }).click();
  await summaryBaseConflict;
  await page.getByText('服务器总结已变化，本次没有覆盖', { exact: false }).waitFor();
  await page.getByText('服务器外部新版本', { exact: true }).waitFor();
  assert.equal(await page.getByRole('status').filter({ hasText: '正在保存月报' }).count(), 0,
    'the stale saving notice is cleared after a definite baseline conflict');
  assert.equal(await conflictedMonthly.inputValue(), conflictedDraft, 'a baseline conflict retains the full local draft');
  assert.equal(await page.getByRole('button', { name: '提交月报', exact: true }).isDisabled(), true, 'a baseline conflict pauses further writes');
  const conflictSummaryState = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(conflictSummaryState.summaryRecords[0].work_summary_md, '服务器外部新版本', 'the concurrent server record is not overwritten');
  assert.equal(conflictSummaryState.summaryWriteRequests, 1, 'the conflicted UUID is sent only once');
  assert.equal(conflictSummaryState.summaryReceipts.length, 0, 'a baseline conflict leaves no mutation receipt');
  assert.deepEqual(await page.evaluate(() => ({
    session: sessionStorage.getItem('xmt:report-summary-update:pending:actor:953'),
    local: localStorage.getItem('xmt:report-summary-update:pending:actor:953'),
  })), { session: null, local: null }, 'a definite baseline rejection safely releases the marker while preserving the local draft');

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
  await page.request.post(`${base}/__qa/fail-next-summary-archive`);
  await page.getByRole('button', { name: '月报', exact: true }).click();
  await page.getByRole('heading', { name: '日报归档加载失败', exact: true }).waitFor();
  await page.getByText('日报归档加载失败，请检查连接后重试。', { exact: true }).waitFor();
  assert.equal(await page.getByText('Internal Server Error', { exact: true }).count(), 0, 'summary archive load does not expose a raw technical response');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByText('完整工作总结', { exact: false }).waitFor();
  await page.getByRole('button', { name: '日报', exact: true }).click();
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

  const archiveApiRequests: Array<{ method: string; url: string }> = [];
  const archiveRequestListener = (request: import('playwright').Request) => {
    if (request.url().includes('/api/')) archiveApiRequests.push({ method: request.method(), url: request.url() });
  };
  page.on('request', archiveRequestListener);
  const archiveStateBeforeDetails = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: '月报', exact: true }).click();
  const monthlyTrigger = page.getByRole('button', { name: /完整工作总结/ });
  await monthlyTrigger.click();
  const monthlyDialog = page.getByRole('dialog', { name: '月报详情' });
  await monthlyDialog.waitFor();
  for (const value of ['完整工作总结', '完整重点项目', '完整问题与计划']) {
    await monthlyDialog.getByText(value, { exact: false }).waitFor();
  }
  await monthlyDialog.screenshot({ path: '/tmp/xmt-summary-archive-monthly-details.png' });
  await assertSummaryArchiveDialogLifecycle(page, '月报详情', monthlyTrigger, { width: 1440, height: 960 });

  await page.setViewportSize({ width: 320, height: 480 });
  await monthlyTrigger.scrollIntoViewIfNeeded();
  await monthlyTrigger.click();
  await assertSummaryArchiveDialogLifecycle(page, '月报详情', monthlyTrigger, { width: 320, height: 480 });

  await page.setViewportSize({ width: 390, height: 480 });
  await page.getByRole('button', { name: '年报', exact: true }).click();
  const yearlyTrigger = page.getByRole('button', { name: /完整年度总结/ });
  await yearlyTrigger.click();
  const yearlyDialog = page.getByRole('dialog', { name: '年报详情' });
  await yearlyDialog.waitFor();
  for (const value of ['完整年度总结', '完整主要成果', '未填写', '完整下一年度计划']) {
    await yearlyDialog.getByText(value, { exact: value === '未填写' }).waitFor();
  }
  await yearlyDialog.screenshot({ path: '/tmp/xmt-summary-archive-yearly-details-390.png' });
  await assertSummaryArchiveDialogLifecycle(page, '年报详情', yearlyTrigger, { width: 390, height: 480 });
  page.off('request', archiveRequestListener);

  const afterArchiveRead = await page.request.get(`${base}/__qa/state`).then((response) => response.json());
  assert.equal(afterArchiveRead.draftRequests, afterRetry.draftRequests, 'viewing summary archives must not save a draft');
  assert.equal(afterArchiveRead.submitRequests, afterRetry.submitRequests, 'viewing summary archives must not submit a report');
  assert.equal(afterArchiveRead.summaryWriteRequests, archiveStateBeforeDetails.summaryWriteRequests, 'viewing monthly archive details never writes a monthly summary');
  assert.equal(afterArchiveRead.yearlyWriteRequests, archiveStateBeforeDetails.yearlyWriteRequests, 'viewing yearly archive details never writes a yearly summary');
  assert.ok(archiveApiRequests.some((request) => request.method === 'GET' && request.url.includes('/api/report-summaries/archive')),
    'archive details are loaded from the read-only archive endpoint');
  assert.deepEqual(archiveApiRequests.filter((request) => request.method !== 'GET'), [],
    'opening, scrolling, and closing monthly/yearly archive details uses no API writes');

  for (const delayedOutcome of ['success', 'failure'] as const) {
    let resolveDailyReadStarted: (() => void) | null = null;
    const staleDailyReadStarted = new Promise<void>((resolve) => { resolveDailyReadStarted = resolve; });
    let releaseStaleRead: ((outcome: 'success' | 'failure') => void) | null = null;
    const identityPage = await context.newPage();
    identityPage.setDefaultTimeout(5000);
    identityPage.on('pageerror', (error) => unexpectedErrors.push(error.message));
    identityPage.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().includes('503 (Service Unavailable)') || message.text().includes('409 (Conflict)')) expectedHttpErrors.push(message.text());
      else unexpectedErrors.push(message.text());
    });
    const dailyReadMethods: string[] = [];
    identityPage.on('request', (request) => {
      if (request.url().includes('/api/daily-reports/')) dailyReadMethods.push(request.method());
    });
    const oldAccountReport: FixtureReport = {
      id: 980,
      userId: identityUserA.id,
      userName: identityUserA.name,
      reportDate,
      status: 'draft',
      manualSummaryMd: '',
      riskLevel: 'normal',
      version: 1,
      items: [{ id: 981, sectionKey: 'today', title: '今日工作', contentMd: '迟到的旧账号日报内容', sortOrder: 0 }],
    };
    const newAccountReport: FixtureReport = {
      id: 982,
      userId: identityUserB.id,
      userName: identityUserB.name,
      reportDate,
      status: 'draft',
      manualSummaryMd: '',
      riskLevel: 'normal',
      version: 1,
      items: [{ id: 983, sectionKey: 'today', title: '今日工作', contentMd: '新账号当前日报内容', sortOrder: 0 }],
    };
    const dailyReadEnvelope = (nextReport: FixtureReport) => ({
      success: true,
      data: {
        reportDate,
        template: { id: null, name: '默认模板', description: '', sections: [] },
        report: nextReport,
        canCreate: true,
      },
    });
    await identityPage.route(/\/api\/daily-reports\/me(?:\?.*)?$/, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization === 'Bearer daily-report-account-a-token') {
        resolveDailyReadStarted?.();
        const outcome = await new Promise<'success' | 'failure'>((resolve) => { releaseStaleRead = resolve; });
        return outcome === 'failure'
          ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: '模拟旧账号日报读取失败' }) })
          : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dailyReadEnvelope(oldAccountReport)) });
      }
      if (authorization === 'Bearer daily-report-account-b-token') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dailyReadEnvelope(newAccountReport)) });
      }
      return route.continue();
    });
    try {
      await identityPage.goto(`${base}/__qa/daily-identity`, { waitUntil: 'domcontentloaded' });
      await Promise.race([
        staleDailyReadStarted,
        identityPage.waitForTimeout(5000).then(() => assert.fail('the old account /me read did not reach the held fixture response')),
      ]);
      const currentDailyRead = identityPage.waitForResponse((response) => response.request().method() === 'GET'
        && response.url().includes('/api/daily-reports/me'));
      fixtureUser = identityUserB;
      report = newAccountReport;
      await identityPage.evaluate(async (nextUser) => {
        const { useAuthStore } = await import('/src/store/index.ts');
        useAuthStore.getState().login(nextUser, 'daily-report-account-b-token', { persist: 'memory' });
      }, identityUserB);
      const currentResponse = await currentDailyRead;
      assert.equal(currentResponse.request().headers().authorization, 'Bearer daily-report-account-b-token', 'the refreshed read uses the new account token');
      assert.equal(currentResponse.status(), 200, 'the new account gets its own successful /me read');
      await identityPage.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('textarea[placeholder="记录今天完成或推进的工作"]')?.value === '新账号当前日报内容');
      const editor = identityPage.getByPlaceholder('记录今天完成或推进的工作');
      assert.equal(await editor.inputValue(), '新账号当前日报内容', 'the new account report is displayed before the old request is released');

      const staleDailyReadResponse = identityPage.waitForResponse((response) => response.request().method() === 'GET'
        && response.url().includes('/api/daily-reports/me'));
      releaseStaleRead?.(delayedOutcome);
      releaseStaleRead = null;
      const oldResponse = await staleDailyReadResponse;
      assert.equal(oldResponse.status(), delayedOutcome === 'success' ? 200 : 503, 'the fixture releases the old request with the selected late outcome');
      await identityPage.waitForTimeout(50);
      assert.equal(await editor.inputValue(), '新账号当前日报内容', `a late ${delayedOutcome} response for account A cannot replace account B data`);
      assert.equal(await identityPage.getByText('迟到的旧账号日报内容', { exact: true }).count(), 0, 'the old account report content remains hidden');
      assert.equal(await identityPage.getByText('日报加载失败', { exact: true }).count(), 0, 'a late old-account failure cannot replace the current view with an error');
      assert.deepEqual(dailyReadMethods, ['GET', 'GET'], 'switching accounts performs only the two read-only /me requests');
    } finally {
      releaseStaleRead?.('failure');
      await identityPage.close();
    }
  }

  for (const reconciliation of ['success', 'retry'] as const) {
    const ambiguousPage = await context.newPage();
    ambiguousPage.setDefaultTimeout(5000);
    ambiguousPage.on('pageerror', (error) => unexpectedErrors.push(error.message));
    ambiguousPage.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().includes('503 (Service Unavailable)') || message.text().includes('409 (Conflict)')) expectedHttpErrors.push(message.text());
      else unexpectedErrors.push(message.text());
    });
    try {
      const route = reconciliation === 'retry' ? '/__qa/submit-committed-error?reconcile=retry' : '/__qa/submit-committed-error';
      await ambiguousPage.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
      await ambiguousPage.getByRole('heading', { name: '日报' }).waitFor();
      const editor = ambiguousPage.getByPlaceholder('记录今天完成或推进的工作');
      await editor.waitFor();
      await editor.fill(`日报已写入后响应异常恢复-${reconciliation}`);
      const committedButFailedResponse = ambiguousPage.waitForResponse((response) => response.request().method() === 'POST'
        && response.url().includes('/api/daily-reports/990/submit') && response.status() === 503);
      await ambiguousPage.getByRole('button', { name: '提交日报', exact: true }).click();
      await committedButFailedResponse;

      if (reconciliation === 'retry') {
        const unknownNotice = ambiguousPage.getByRole('alert').filter({ hasText: '提交结果无法确认' });
        await unknownNotice.waitFor();
        await ambiguousPage.getByText('状态待确认', { exact: true }).waitFor();
        assert.equal(await editor.isDisabled(), true, 'editing remains locked while the committed state is unknown');
        const lockedSubmit = ambiguousPage.getByRole('button', { name: '状态待核实', exact: true });
        assert.equal(await lockedSubmit.isDisabled(), true, 'the user cannot submit again before reconciling an ambiguous result');
        const confirmedRead = ambiguousPage.waitForResponse((response) => response.request().method() === 'GET'
          && response.url().includes('/api/daily-reports/me') && response.status() === 200);
        await unknownNotice.getByRole('button', { name: '重新核实日报状态', exact: true }).click();
        await confirmedRead;
      }

      await ambiguousPage.getByText('已提交', { exact: true }).waitFor();
      await ambiguousPage.getByText('提交状态已核实', { exact: true }).waitFor();
      assert.equal(await ambiguousPage.getByRole('alert').count(), 0, 'confirmed submission clears the uncertainty notice');
      assert.equal(await ambiguousPage.getByRole('button', { name: '提交日报', exact: true }).isDisabled(), true, 'a confirmed submitted report is read-only and cannot be submitted twice');
      assert.equal(await editor.isDisabled(), true, 'a confirmed submitted report cannot be edited as a draft');

      const reconciledState = await ambiguousPage.request.get(`${base}/__qa/state`).then((response) => response.json());
      assert.equal(reconciledState.report?.status, 'submitted', 'the server committed the report before its first response failed');
      assert.equal(reconciledState.draftRequests, 1, 'reconciliation never repeats the draft write');
      assert.equal(reconciledState.submitRequests, 1, 'reconciliation never repeats the submit write');
      assert.equal(reconciledState.dailyReportReadRequests, reconciliation === 'retry' ? 3 : 2, 'only the initial read, reconciliation, and explicit read retry occur');
      await ambiguousPage.screenshot({ path: `/tmp/xmt-daily-report-submit-committed-${reconciliation}.png`, fullPage: false });
    } finally {
      await ambiguousPage.close();
    }
  }

  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  mobilePage.setDefaultTimeout(5000);
  mobilePage.on('pageerror', (error) => unexpectedErrors.push(error.message));
  mobilePage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)') || message.text().includes('409 (Conflict)')) expectedHttpErrors.push(message.text());
    else unexpectedErrors.push(message.text());
  });
  const mobileRecoveryKey = `xmt:mobile-daily-report-draft-recovery:v1:${user.id}:${reportDate}`;
  const mobileCleanupFailurePage = await context.newPage();
  await mobileCleanupFailurePage.setViewportSize({ width: 390, height: 844 });
  mobileCleanupFailurePage.setDefaultTimeout(5000);
  mobileCleanupFailurePage.on('pageerror', (error) => unexpectedErrors.push(error.message));
  mobileCleanupFailurePage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)') || message.text().includes('409 (Conflict)')) expectedHttpErrors.push(message.text());
    else unexpectedErrors.push(message.text());
  });
  await mobileCleanupFailurePage.addInitScript((key) => {
    const nativeRemoveItem = Storage.prototype.removeItem;
    let failFirstRemoval = true;
    Storage.prototype.removeItem = function (name) {
      if (this === window.sessionStorage && name === key && failFirstRemoval) {
        failFirstRemoval = false;
        throw new DOMException('模拟移动端恢复记录清理失败', 'QuotaExceededError');
      }
      nativeRemoveItem.call(this, name);
    };
  }, mobileRecoveryKey);
  try {
    await mobileCleanupFailurePage.goto(`${base}/__qa?skipInitialSubmitFailure=1`, { waitUntil: 'domcontentloaded' });
    await mobileCleanupFailurePage.getByText(`${reportDate} · 我的日报`, { exact: true }).waitFor();
    const editor = mobileCleanupFailurePage.getByPlaceholder('记录今天完成或推进的工作');
    await editor.fill('移动端草稿已确认但恢复记录清理失败');
    const draftSaved = mobileCleanupFailurePage.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().endsWith('/api/daily-reports/draft') && response.status() === 200);
    await mobileCleanupFailurePage.getByRole('button', { name: '提交日报', exact: true }).click();
    await draftSaved;
    await mobileCleanupFailurePage.getByRole('alert').filter({ hasText: '日报草稿已保存，但本机恢复记录未能清除' }).waitFor();
    const stateAfterCleanupFailure = await mobileCleanupFailurePage.request.get(`${base}/__qa/state`).then((response) => response.json());
    assert.equal(stateAfterCleanupFailure.report?.status, 'draft', 'mobile keeps a confirmed draft unsubmitted when its recovery marker cannot be cleared');
    assert.equal(stateAfterCleanupFailure.draftRequests, 1, 'mobile does not repeat the confirmed draft write while cleanup is blocked');
    assert.equal(stateAfterCleanupFailure.submitRequests, 0, 'mobile waits to submit until the recovery marker is cleared');
    assert.equal(await mobileCleanupFailurePage.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || 'null')?.phase, mobileRecoveryKey), 'saved',
      'mobile retains a saved-phase recovery marker after cleanup fails');
    assert.equal(await editor.isDisabled(), true, 'mobile editing remains locked while cleanup is unresolved');

    await mobileCleanupFailurePage.reload({ waitUntil: 'domcontentloaded' });
    await mobileCleanupFailurePage.getByRole('alert').filter({ hasText: '服务器已确认草稿保存成功' }).waitFor();
    assert.equal(await mobileCleanupFailurePage.getByPlaceholder('记录今天完成或推进的工作').isDisabled(), true,
      'mobile remains locked immediately after reopening a saved recovery marker');
    const cleanupButton = mobileCleanupFailurePage.getByRole('button', { name: '重试清理恢复记录', exact: true });
    assert.equal(await cleanupButton.isVisible(), true, 'mobile offers recovery-marker cleanup immediately after reopening');
    await cleanupButton.click();
    await mobileCleanupFailurePage.getByRole('alert').filter({ hasText: '本机恢复记录仍未能清除' }).waitFor();
    assert.equal(await mobileCleanupFailurePage.getByPlaceholder('记录今天完成或推进的工作').isDisabled(), true,
      'mobile keeps editing and submission locked while repeated cleanup still fails');

    await mobileCleanupFailurePage.getByRole('button', { name: '重试清理恢复记录', exact: true }).click();
    await mobileCleanupFailurePage.getByRole('status').filter({ hasText: '本机恢复记录已清除' }).waitFor();
    assert.equal(await mobileCleanupFailurePage.evaluate((key) => sessionStorage.getItem(key), mobileRecoveryKey), null,
      'mobile retry removes the recovery marker before enabling submit');
    const submitAfterCleanupRetry = mobileCleanupFailurePage.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().includes('/api/daily-reports/990/submit') && response.status() === 200);
    await mobileCleanupFailurePage.getByRole('button', { name: '提交日报', exact: true }).click();
    await submitAfterCleanupRetry;
    const stateAfterCleanupRetry = await mobileCleanupFailurePage.request.get(`${base}/__qa/state`).then((response) => response.json());
    assert.equal(stateAfterCleanupRetry.draftRequests, 1, 'mobile cleanup retry does not write the same draft again');
    assert.equal(stateAfterCleanupRetry.submitRequests, 1, 'mobile submits once after cleanup succeeds');
    assert.equal(stateAfterCleanupRetry.report?.status, 'submitted', 'mobile submits the confirmed draft after cleanup succeeds');
    assert.equal(await mobileCleanupFailurePage.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth), false,
      'the 390px mobile cleanup recovery view has no horizontal overflow');
  } finally {
    await mobileCleanupFailurePage.close();
  }

  try {
    await mobilePage.goto(`${base}/__qa/submit-committed-error?reconcile=retry`, { waitUntil: 'domcontentloaded' });
    await mobilePage.getByText(`${reportDate} · 我的日报`, { exact: true }).waitFor();
    const mobileReportViewNavigation = mobilePage.getByRole('navigation', { name: '日报视图' });
    assert.equal(await mobileReportViewNavigation.getByRole('button').count(), 3, 'the mobile daily report navigation keeps its accessible name and all three visible views');
    assert.equal(await mobileReportViewNavigation.getByRole('button', { name: '我的日报', exact: true }).getAttribute('aria-pressed'), 'true', 'the mobile daily report navigation exposes the selected view');
    const mobileEditor = mobilePage.getByPlaceholder('记录今天完成或推进的工作');
    await mobileEditor.fill('移动日报已提交但响应异常恢复验收');
    const mobileCommitFailure = mobilePage.waitForResponse((response) => response.request().method() === 'POST'
      && response.url().includes('/api/daily-reports/990/submit') && response.status() === 503);
    await mobilePage.getByRole('button', { name: '提交日报', exact: true }).click();
    await mobileCommitFailure;
    const mobileUnknownNotice = mobilePage.getByRole('status').filter({ hasText: '提交结果无法确认' });
    await mobileUnknownNotice.waitFor();
    await mobilePage.getByText('状态待确认', { exact: true }).waitFor();
    assert.equal(await mobileEditor.isDisabled(), true, 'mobile editing is locked while the committed submit state is unknown');
    assert.equal(await mobilePage.getByRole('button', { name: '状态待核实', exact: true }).isDisabled(), true, 'mobile cannot repeat submit while the result is unknown');
    const mobileConfirmedRead = mobilePage.waitForResponse((response) => response.request().method() === 'GET'
      && response.url().includes('/api/daily-reports/me') && response.status() === 200);
    await mobileUnknownNotice.getByRole('button', { name: '重新核实日报状态', exact: true }).click();
    await mobileConfirmedRead;
    await mobilePage.getByText('审核中', { exact: true }).waitFor();
    assert.equal(await mobileEditor.isDisabled(), true, 'mobile reports already submitted to review are read-only');
    assert.equal(await mobilePage.getByRole('button', { name: '保存草稿' }).isDisabled(), true, 'mobile cannot save an already-submitted report');
    assert.equal(await mobilePage.getByRole('button', { name: '提交日报' }).isDisabled(), true, 'mobile cannot submit an already-submitted report twice');
    const mobileReconciledState = await mobilePage.request.get(`${base}/__qa/state`).then((response) => response.json());
    assert.equal(mobileReconciledState.report?.status, 'submitted', 'mobile recovery shows the committed server state');
    assert.equal(mobileReconciledState.draftRequests, 1, 'mobile reconciliation never repeats the draft write');
    assert.equal(mobileReconciledState.submitRequests, 1, 'mobile reconciliation never repeats the submit write');
    assert.equal(mobileReconciledState.dailyReportReadRequests, 3, 'mobile recovery uses only initial, reconciliation, and explicit read requests');
    const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
    assert.equal(mobileOverflow, false, 'the 390px mobile submit recovery view has no horizontal overflow');
  } finally {
    await mobilePage.close();
  }

  const detailPage = await context.newPage();
  detailPage.setDefaultTimeout(5000);
  detailPage.on('pageerror', (error) => unexpectedErrors.push(error.message));
  detailPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)') || message.text().includes('409 (Conflict)')) expectedHttpErrors.push(message.text());
    else unexpectedErrors.push(message.text());
  });
  const detailWriteRequests: string[] = [];
  detailPage.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/')) detailWriteRequests.push(`${request.method()} ${request.url()}`);
  });
  try {
    await detailPage.goto(`${base}/__qa/daily-detail`, { waitUntil: 'domcontentloaded' });
    await detailPage.getByRole('heading', { name: '日报' }).waitFor();
    await detailPage.getByRole('button', { name: '团队日报', exact: true }).click();
    const teamViewButton = detailPage.getByTestId('team-daily-report-board').getByRole('button', { name: '查看', exact: true });
    await teamViewButton.waitFor();
    await teamViewButton.click();

    let drawer = detailPage.getByRole('dialog', { name: /日报详情.*日报详情验收成员/ });
    await drawer.waitFor();
    let closeButton = drawer.getByRole('button', { name: '关闭日报详情', exact: true });
    assert.equal(await closeButton.evaluate((element) => element === document.activeElement), true, 'opening from the team board focuses the close action');
    const desktopBounds = await closeButton.boundingBox();
    assert.ok(desktopBounds && desktopBounds.width >= 40 && desktopBounds.height >= 40, 'desktop close target is at least 40×40 CSS pixels');
    await detailPage.screenshot({ path: '/tmp/xmt-daily-report-detail-drawer-1440.png', fullPage: false });
    await detailPage.keyboard.press('Tab');
    assert.equal(await closeButton.evaluate((element) => element === document.activeElement), true, 'Tab cannot escape the drawer');
    await detailPage.keyboard.press('Shift+Tab');
    assert.equal(await closeButton.evaluate((element) => element === document.activeElement), true, 'Shift+Tab cannot escape the drawer');
    await detailPage.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    assert.equal(await teamViewButton.evaluate((element) => element === document.activeElement), true, 'Escape returns focus to the team-board trigger');

    await teamViewButton.click();
    drawer = detailPage.getByRole('dialog', { name: /日报详情.*日报详情验收成员/ });
    await drawer.waitFor();
    await detailPage.getByTestId('daily-report-detail-backdrop').click({ position: { x: 4, y: 4 } });
    await drawer.waitFor({ state: 'hidden' });
    assert.equal(await teamViewButton.evaluate((element) => element === document.activeElement), true, 'backdrop close returns focus to the team-board trigger');

    await detailPage.setViewportSize({ width: 320, height: 800 });
    await teamViewButton.click();
    drawer = detailPage.getByRole('dialog', { name: /日报详情.*日报详情验收成员/ });
    await drawer.waitFor();
    closeButton = drawer.getByRole('button', { name: '关闭日报详情', exact: true });
    const mobileBounds = await closeButton.boundingBox();
    assert.ok(mobileBounds && mobileBounds.x >= 0 && mobileBounds.y >= 0
      && mobileBounds.x + mobileBounds.width <= 320 && mobileBounds.y + mobileBounds.height <= 800,
    'the close action remains fully visible at 320px');
    const mobileLayout = await detailPage.evaluate(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const content = dialog?.querySelector<HTMLElement>('.overflow-y-auto');
      return {
        viewportWidth: innerWidth,
        documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        dialogWidth: dialog?.clientWidth ?? 0,
        contentWidth: content?.clientWidth ?? 0,
        contentScrollWidth: content?.scrollWidth ?? 0,
        contentHeight: content?.clientHeight ?? 0,
        contentScrollHeight: content?.scrollHeight ?? 0,
      };
    });
    assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth, 'the 320px detail drawer has no horizontal page overflow');
    assert.ok(mobileLayout.contentScrollHeight > mobileLayout.contentHeight, 'long daily-report content scrolls inside the drawer');
    assert.ok(mobileLayout.contentScrollWidth <= mobileLayout.contentWidth, 'long report text wraps without overflowing the drawer');
    await detailPage.screenshot({ path: '/tmp/xmt-daily-report-detail-drawer-320.png', fullPage: false });
    await closeButton.click();
    await drawer.waitFor({ state: 'hidden' });
    assert.equal(await teamViewButton.evaluate((element) => element === document.activeElement), true, 'closing on mobile returns focus to the team-board trigger');

    await detailPage.setViewportSize({ width: 390, height: 844 });
    await detailPage.evaluate(async () => {
      const { useAppStore } = await import('/src/store/index.ts');
      useAppStore.getState().setTheme('dark');
    });
    assert.equal(await detailPage.locator('html').evaluate((element) => element.classList.contains('dark')), true, 'the dark theme is active for the archive path');
    await detailPage.getByRole('button', { name: '总结归档', exact: true }).click();
    const archiveViewButton = detailPage.getByRole('button', { name: '查看', exact: true }).first();
    await archiveViewButton.waitFor();
    await archiveViewButton.click();
    drawer = detailPage.getByRole('dialog', { name: /日报详情.*日报状态 1/ });
    await drawer.waitFor();
    closeButton = drawer.getByRole('button', { name: '关闭日报详情', exact: true });
    const archiveBounds = await closeButton.boundingBox();
    assert.ok(archiveBounds && archiveBounds.x >= 0 && archiveBounds.x + archiveBounds.width <= 390,
      'the archive detail close action remains visible at 390px');
    const archiveOverflow = await detailPage.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth);
    assert.equal(archiveOverflow, false, 'the 390px dark-theme archive detail has no horizontal overflow');
    await detailPage.screenshot({ path: '/tmp/xmt-daily-report-detail-drawer-390-dark.png', fullPage: false });
    await detailPage.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    assert.equal(await archiveViewButton.evaluate((element) => element === document.activeElement), true, 'archive detail close returns focus to its original row action');
    assert.deepEqual(detailWriteRequests, [], 'team and archive detail viewing performs no API writes');
  } finally {
    await detailPage.close();
  }

  assert.deepEqual(unexpectedErrors, [], 'the isolated desktop report flow renders without unexpected browser errors');
  assert.equal(expectedHttpErrors.length, 16, 'browser HTTP errors are limited to injected draft-save, draft-reconciliation, deterministic-conflict, submit, summary, member-directory, and stale-identity failures');
  await context.close();
  console.log('Daily Report browser test passed: safe submit recovery including committed-write reconciliation, read-only identity isolation, accurate archive statuses, and complete read-only monthly/yearly detail dialogs on desktop and mobile.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
