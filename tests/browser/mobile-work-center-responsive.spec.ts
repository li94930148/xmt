import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import express from 'express';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';

const screenshotDir = '/tmp/xmt-mobile-work-center-responsive';
const appVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const user = {
  id: 1,
  username: 'mobile-browser-qa',
  name: '移动验收',
  role: 'admin',
  email: 'mobile-qa@example.invalid',
  enabled: true,
  force_change_password: false,
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};
let fixtureUser = user;
let fixturePermissions: string[] = [];
const inspiration = {
  id: 901,
  title: '周末夜市的烟火气',
  description: '记录摊主和老街的故事。',
  category: '故事',
  status: 'active',
  votes: 3,
  creator_id: 1,
  creator_name: '移动验收',
  comment_count: 0,
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};
const promotedInspiration = {
  ...inspiration,
  id: 902,
  title: '老街早餐铺的传承',
  status: 'promoted',
  topic_id: 903,
};
const linkedTopic = {
  id: 903,
  title: '老街早餐铺的传承',
  description: '记录早餐铺的故事。',
  status: 'production',
  creator_id: 1,
  creator_name: '移动验收',
  assignee_id: 1,
  assignee_name: '移动验收',
  history: [],
  updated_at: '2026-09-27T00:00:00.000Z',
};
let editableTopic = {
  ...linkedTopic,
  id: 904,
  title: '可恢复修改的选题',
  status: 'pending',
  creator_id: 5,
  assignee_id: null,
};
let auditableTopic = {
  ...linkedTopic,
  id: 905,
  title: '待审核的移动选题',
  status: 'pending',
  creator_id: 1,
  assignee_id: null,
};
const unknownStatusTopic = {
  ...linkedTopic,
  id: 907,
  title: '未知状态移动选题',
  status: 'legacy_review',
  creator_id: 1,
  assignee_id: null,
};
const linkedCalendarEvent = {
  id: 990,
  title: '拍摄准备',
  description: '核对拍摄提纲',
  event_date: '2099-08-17T09:00:00.000Z',
  event_type: 'shooting',
  topic_id: linkedTopic.id,
  topic_title: linkedTopic.title,
  creator_id: 1,
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};
const createdCalendarEvents: typeof linkedCalendarEvent[] = [];
const createAttempts = new Map<string, number>();
const topicCreateAttempts = new Map<string, number>();
let mobileMessagesFixture: Array<{ id: number; title: string; content: string; read: boolean; link?: string }> = [];
let messageLoadFailures = 0;
let messageReadFailures = 0;
let messageReadAttempts = 0;
let passwordChangeFailures = 0;
let passwordChangeAttempts = 0;
let topicUpdateAttempts = 0;
let topicAuditAttempts = 0;
const topicAuditComments: string[] = [];
function createDailyReport() {
  return {
    id: 780,
    userId: 1,
    reportDate: '2026-09-27',
    status: 'draft',
    manualSummaryMd: '',
    riskLevel: 'normal',
    version: 5,
    items: [{ id: 781, reportId: 780, sectionKey: 'today', title: '今日工作', contentMd: '', sortOrder: 0 }],
  };
}
let dailyReport = createDailyReport();
let failNextDailySubmit = true;
const dailyDraftVersions: Array<number | undefined> = [];
const mobileProductionFixture = {
  id: 780,
  topic_id: linkedTopic.id,
  version: 'v1.0',
  content: '<p>只读范围验收稿件</p>',
  status: 'draft',
  file_path: '',
  operator_id: 1,
  operator_name: '移动验收',
  topic_title: linkedTopic.title,
  topic_status: linkedTopic.status,
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};
const unknownStatusProductionFixture = {
  ...mobileProductionFixture,
  id: 781,
  topic_title: '未知状态创作稿件',
  status: 'legacy_draft',
};
const shootingStatusFixture = {
  id: 861,
  topic_id: linkedTopic.id,
  topic_title: '状态映射拍摄任务',
  topic_status: 'shooting',
  status: 'legacy_transcoding',
  plan_date: '2026-09-28T09:00:00.000Z',
  location: '影棚 A',
  equipment: '',
  operator_name: '移动验收',
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
  script_content: null,
  production: null,
};
const publishingStatusFixture = {
  id: 862,
  topic_id: linkedTopic.id,
  topic_title: '状态映射发布任务',
  topic_description: '',
  topic_platform: '抖音',
  topic_deadline: '',
  topic_status: 'publishing',
  platform: '抖音',
  url: '',
  status: 'legacy_verifying',
  publish_time: '',
  script_content: null,
  operator_name: '移动验收',
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
  production: null,
  shooting: {
    id: shootingStatusFixture.id,
    plan_date: shootingStatusFixture.plan_date,
    location: shootingStatusFixture.location,
    equipment: shootingStatusFixture.equipment,
    status: shootingStatusFixture.status,
    operator_name: shootingStatusFixture.operator_name,
    created_at: shootingStatusFixture.created_at,
  },
  topicHistory: [],
};

const fixtureApi = express();
fixtureApi.use(express.json());
fixtureApi.use('/api', async (request, response) => {
  if (request.path === '/auth/me') return response.json(fixtureUser);
  if (request.path === '/permissions/my') return response.json(fixturePermissions);
  if (request.path === '/messages/unread') return response.json({ unreadCount: 0 });
  if (request.path === '/auth/change-password' && request.method === 'POST') {
    passwordChangeAttempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (passwordChangeFailures > 0) { passwordChangeFailures -= 1; return response.status(503).json({ message: '密码服务暂不可用，请重试' }); }
    return response.json({ message: '密码已更新' });
  }
  if (request.path === '/system-settings/public' || request.path === '/system-settings') return response.json({});
  if (request.path === '/topics' && request.method === 'POST') {
    const title = String(request.body?.title ?? '');
    const attempts = (topicCreateAttempts.get(title) ?? 0) + 1;
    topicCreateAttempts.set(title, attempts);
    if (attempts === 1) return response.status(503).json({ message: '选题服务暂不可用，已保留本次输入' });
    return response.json({ message: '选题创建成功', data: { topicId: 906 } });
  }
  if (request.path === `/topics/${editableTopic.id}` && request.method === 'PUT') {
    topicUpdateAttempts += 1;
    if (topicUpdateAttempts === 1) return response.status(503).json({ message: '保存服务暂不可用，请稍后重试' });
    editableTopic = { ...editableTopic, ...request.body };
    return response.json({ message: '选题更新成功' });
  }
  if (request.path === `/topics/${auditableTopic.id}/audit` && request.method === 'POST') {
    topicAuditAttempts += 1;
    topicAuditComments.push(String(request.body?.comment ?? ''));
    if (topicAuditAttempts === 1) return response.status(503).json({ message: '审核服务暂不可用，请稍后重试' });
    auditableTopic = { ...auditableTopic, status: request.body?.status };
    return response.json({ message: '选题审核成功' });
  }
  if (request.path === '/topics') return response.json({ data: [unknownStatusTopic, linkedTopic, editableTopic, auditableTopic], total: 4, page: 1, limit: 20 });
  if (request.path === `/topics/${linkedTopic.id}`) return response.json({ data: linkedTopic });
  if (request.path === `/topics/${editableTopic.id}`) return response.json({ data: editableTopic });
  if (request.path === `/topics/${auditableTopic.id}`) return response.json({ data: auditableTopic });
  if (request.path === `/topics/${unknownStatusTopic.id}`) return response.json({ data: unknownStatusTopic });
  if ([linkedTopic.id, editableTopic.id, auditableTopic.id, unknownStatusTopic.id].some((id) => request.path === `/topics/${id}/resources`)) return response.json({ data: [] });
  if (request.path === `/workflow/production/${mobileProductionFixture.id}` && request.method === 'GET') {
    return response.json({ ...mobileProductionFixture, can_edit: fixtureUser.role === 'editor' });
  }
  if (request.path === '/workflow/production' && request.method === 'GET') {
    return response.json([unknownStatusProductionFixture]);
  }
  if (request.path === '/workflow/shooting' && request.method === 'GET') {
    return response.json({ data: [shootingStatusFixture], total: 1, page: 1, limit: 20 });
  }
  if (request.path === `/workflow/shooting/${shootingStatusFixture.id}` && request.method === 'GET') {
    return response.json(shootingStatusFixture);
  }
  if (request.path === '/workflow/publishing' && request.method === 'GET') {
    return response.json({
      data: [publishingStatusFixture],
      total: 1,
      page: 1,
      limit: 20,
      summary: { today: 0, pending: 0, published: 0, failed: 0 },
    });
  }
  if (request.path === `/workflow/publishing/${publishingStatusFixture.id}` && request.method === 'GET') {
    return response.json(publishingStatusFixture);
  }
  if (request.path === '/calendar' && request.method === 'POST') {
    const title = String(request.body?.title ?? '');
    const attempts = (createAttempts.get(title) ?? 0) + 1;
    createAttempts.set(title, attempts);
    if (attempts === 1) return response.status(503).json({ message: '测试创建失败' });
    const event = { ...linkedCalendarEvent, ...request.body, id: 991 + createdCalendarEvents.length, topic_id: request.body?.topic_id, topic_title: request.body?.topic_id ? linkedTopic.title : undefined };
    createdCalendarEvents.push(event);
    return response.json({ message: '日历事件创建成功', id: event.id });
  }
  if (request.path === '/calendar') return response.json({ data: [linkedCalendarEvent, ...createdCalendarEvents] });
  if (request.path === '/daily-reports/me' && request.method === 'GET') {
    return response.json({ success: true, data: { reportDate: dailyReport.reportDate, template: { id: null, name: '默认模板', description: '', sections: [] }, report: dailyReport, canCreate: true } });
  }
  if (request.path === '/daily-reports/draft' && request.method === 'POST') {
    const version = request.body?.version as number | undefined;
    dailyDraftVersions.push(version);
    if (version !== undefined && version !== dailyReport.version) {
      return response.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: '日报版本已变化，请刷新后再保存' });
    }
    dailyReport = { ...dailyReport, status: 'draft', version: dailyReport.version + 1, manualSummaryMd: request.body?.manualSummaryMd ?? '', items: request.body?.items ?? dailyReport.items };
    return response.json({ success: true, data: dailyReport });
  }
  if (request.path === `/daily-reports/${dailyReport.id}/submit` && request.method === 'POST') {
    if (failNextDailySubmit) {
      failNextDailySubmit = false;
      return response.status(503).json({ success: false, message: '模拟提交失败' });
    }
    dailyReport = { ...dailyReport, status: 'submitted', version: dailyReport.version + 1 };
    return response.json({ success: true, data: dailyReport });
  }
  if (request.path === '/inspirations') return response.json({ data: [inspiration, promotedInspiration], total: 2 });
  if (request.path === '/inspirations/901') return response.json({ inspiration, comments: [] });
  if (request.path === '/users') return response.json({ data: [], total: 0, page: 1, limit: 100 });
  if (request.path === '/messages' && request.method === 'GET') {
    if (messageLoadFailures > 0) { messageLoadFailures -= 1; return response.status(503).json({ message: '消息服务暂不可用' }); }
    return response.json({ data: mobileMessagesFixture, total: mobileMessagesFixture.length, page: 1, limit: 20 });
  }
  if (/^\/messages\/\d+$/.test(request.path) && request.method === 'PUT') {
    messageReadAttempts += 1;
    if (messageReadFailures > 0) { messageReadFailures -= 1; return response.status(503).json({ message: '消息服务暂不可用，标记失败' }); }
    return response.json({ message: '消息已标记为已读' });
  }
  if (request.path === '/messages' && request.method === 'DELETE') return response.json({ message: '消息已清空' });
  if (request.path === '/messages/read-all' && request.method === 'POST') return response.json({ message: '消息已标记为已读' });
  return response.status(404).json({ message: `Unexpected fixture API request: ${request.method} ${request.path}` });
});
fixtureApi.use('/socket.io', (request, response) => {
  if (request.method === 'GET') {
    return response.type('text/plain').send('0{"sid":"mobile-qa","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
  }
  return response.type('text/plain').send('ok');
});

const server = http.createServer(fixtureApi);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'spa', logLevel: 'error' });
fixtureApi.use(vite.middlewares);
const browser = await chromium.launch({ headless: true });

async function openMobilePage(width: number, authUser = user) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
  await context.addInitScript(({ authUser, version }) => {
    localStorage.setItem('xmt_user', JSON.stringify(authUser));
    localStorage.setItem('xmt_token', 'local-browser-fixture');
    localStorage.setItem('xmt_last_version_seen', version);
  }, { authUser, version: appVersion });
  const page = await context.newPage();
  const errors: string[] = [];
  let expectedConsoleFailures = 0;
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedConsoleFailures > 0 && message.text().includes('503')) {
      expectedConsoleFailures -= 1;
      return;
    }
    errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !(response.status() === 503 && (response.url().includes('/api/calendar') || response.url().includes('/api/daily-reports') || response.url().includes('/api/topics') || response.url().includes('/api/messages') || response.url().includes('/api/auth/change-password')))) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return { context, page, errors, expectConsoleFailure: () => { expectedConsoleFailures += 1; } };
}

async function assertMobileLayout(page: Page, width: number, screenshotName: string) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    main: document.querySelector('main')?.clientWidth,
    mainScroll: document.querySelector('main')?.scrollWidth,
  }));
  assert.equal(metrics.viewport, width);
  assert.equal(metrics.document, width, `${screenshotName}: document overflow ${JSON.stringify(metrics)}`);
  assert.equal(metrics.body, width, `${screenshotName}: body overflow ${JSON.stringify(metrics)}`);
  await page.screenshot({ path: `${screenshotDir}-${width}-${screenshotName}.png`, fullPage: true });
  return metrics;
}

try {
  for (const width of [320, 390]) {
    const { context, page, errors, expectConsoleFailure } = await openMobilePage(width);
    try {
      await page.goto(`${baseUrl}/production`, { waitUntil: 'domcontentloaded' });
      await page.getByText('移动工作中心', { exact: true }).waitFor();
      const hub = await assertMobileLayout(page, width, 'hub');

      await page.getByRole('button', { name: /日历/ }).click();
      await page.waitForURL('**/calendar');
      await page.getByRole('heading', { name: '排期日历' }).waitFor();
      const monthBefore = await page.getByText(/\d{4}年\d{1,2}月/).first().innerText();
      const calendar = await assertMobileLayout(page, width, 'calendar');
      let failCalendarRead = true;
      expectConsoleFailure();
      await page.route('**/api/calendar?*', async (route) => {
        if (failCalendarRead) {
          failCalendarRead = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '测试读取失败' }) });
          return;
        }
        await route.continue();
      });
      await page.getByRole('button', { name: '下月' }).click();
      await page.getByRole('heading', { name: '日历加载失败' }).waitFor();
      assert.equal(await page.getByRole('button', { name: '重试加载' }).isVisible(), true);
      assert.equal(await page.getByText('待拍摄', { exact: true }).count(), 0, 'failed refresh does not leave metrics from the previous month visible');
      if (width === 320) await page.screenshot({ path: '/tmp/xmt-calendar-load-error-320.png', fullPage: true });
      await page.getByRole('button', { name: '重试加载' }).click();
      await page.getByText(linkedCalendarEvent.title, { exact: true }).waitFor();
      await page.unroute('**/api/calendar?*');
      const createTitle = `移动日历写入验证 ${width}`;
      await page.getByRole('button', { name: '新增' }).click();
      await page.getByPlaceholder('事件标题').fill(createTitle);
      expectConsoleFailure();
      const failedCreate = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/calendar') && response.status() === 503);
      await page.getByRole('button', { name: '创建', exact: true }).click();
      await failedCreate;
      assert.equal(createAttempts.get(createTitle), 1, 'one failed submit produces one create request');
      assert.equal(await page.getByPlaceholder('事件标题').isVisible(), true, 'failed create keeps the form available for retry');
      assert.equal(await page.getByRole('button', { name: '创建', exact: true }).isEnabled(), true, 'submit control unlocks after failure');
      if (width === 320) await page.screenshot({ path: '/tmp/xmt-calendar-create-retry-320.png', fullPage: true });
      const successfulRetry = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/calendar') && response.status() === 200);
      await page.getByRole('button', { name: '创建', exact: true }).click();
      await successfulRetry;
      await page.getByRole('heading', { name: createTitle }).waitFor();
      assert.equal(createdCalendarEvents.filter((event) => event.title === createTitle).length, 1, 'retry creates one event after a failed request');
      await page.getByRole('button', { name: '查看关联选题' }).click();
      await page.waitForURL(`**/topics/${linkedTopic.id}`);
      await page.getByRole('button', { name: '返回日历' }).click();
      await page.waitForURL('**/calendar');
      await page.getByRole('button', { name: '下月' }).click();
      await page.waitForFunction((before) => /\d{4}年\d{1,2}月/.exec(document.body.innerText)?.[0] !== before, monthBefore);
      await page.getByRole('button', { name: '返回工作' }).click();
      await page.waitForURL('**/production');

      await page.getByRole('button', { name: '首页' }).click();
      await page.getByRole('button', { name: '排期日历' }).click();
      await page.waitForURL('**/calendar');
      await page.getByRole('button', { name: '返回首页' }).click();
      await page.waitForURL('**/');
      await page.getByRole('button', { name: '工作' }).click();
      await page.waitForURL('**/production');

      await page.getByRole('button', { name: /灵感/ }).click();
      await page.waitForURL('**/inspirations');
      await page.getByRole('heading', { name: '灵感池' }).waitFor();
      await page.getByText(inspiration.title, { exact: true }).waitFor();
      const ideas = await assertMobileLayout(page, width, 'inspirations');
      const inspirationCard = page.getByRole('heading', { name: inspiration.title }).locator('xpath=ancestor::div[@role="button"]');
      const submitIdea = page.getByRole('button', { name: '提交灵感', exact: true });
      assert.equal(await submitIdea.locator('span').evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap');
      const promoteButton = inspirationCard.getByRole('button', { name: '转为选题', exact: true });
      assert.equal(await promoteButton.evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap');
      const cardBounds = await inspirationCard.boundingBox();
      const promoteBounds = await promoteButton.boundingBox();
      assert(cardBounds && promoteBounds && promoteBounds.x + promoteBounds.width <= cardBounds.x + cardBounds.width, 'promote action fits within the inspiration card');
      assert.equal(await inspirationCard.getByRole('button', { name: `删除灵感：${inspiration.title}`, exact: true }).isVisible(), true, 'mobile delete action must not require hover');
      await submitIdea.click();
      await page.getByRole('button', { name: '取消' }).waitFor();
      await page.getByRole('button', { name: '取消' }).click();
      const promotedCard = page.getByRole('heading', { name: promotedInspiration.title }).locator('xpath=ancestor::div[@role="button"]');
      await promotedCard.getByRole('button', { name: '查看关联选题' }).click();
      await page.waitForURL(`**/topics/${linkedTopic.id}`);
      await page.getByRole('button', { name: '返回灵感' }).click();
      await page.waitForURL('**/inspirations');
      await page.getByRole('button', { name: '返回工作' }).click();
      await page.waitForURL('**/production');

      await page.getByRole('button', { name: /看板/ }).click();
      await page.waitForURL('**/kanban');
      await page.getByRole('heading', { name: '看板视图' }).waitFor();
      for (const label of ['平台', '负责人：']) {
        assert.equal(await page.getByText(label, { exact: true }).evaluate((element) => getComputedStyle(element).whiteSpace), 'nowrap');
      }
      const kanban = await assertMobileLayout(page, width, 'kanban');
      await page.getByRole('button', { name: '返回工作' }).click();
      await page.waitForURL('**/production');

      dailyReport = createDailyReport();
      failNextDailySubmit = true;
      dailyDraftVersions.length = 0;
      await page.getByRole('button', { name: '写日报' }).click();
      await page.waitForURL('**/daily-report');
      await page.getByText(/· 我的日报/).waitFor();
      await page.getByPlaceholder('记录今天完成或推进的工作').fill('完成日报保存与提交恢复验收');
      expectConsoleFailure();
      const failedDailySubmit = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/daily-reports/${dailyReport.id}/submit`) && response.status() === 503);
      await page.getByRole('button', { name: '提交日报' }).click();
      await failedDailySubmit;
      await page.getByText('模拟提交失败').waitFor();
      assert.deepEqual(dailyDraftVersions, [5], 'first daily save uses the loaded version');
      await page.getByRole('button', { name: '提交日报' }).click();
      await page.getByText('日报已提交', { exact: true }).waitFor();
      await page.getByText('审核中', { exact: true }).waitFor();
      await page.getByText('日报已提交，审核前仍可修改并再次提交。', { exact: true }).waitFor();
      assert.deepEqual(dailyDraftVersions, [5, 6], 'retry uses the version returned by the successful draft save');
      const daily = await assertMobileLayout(page, width, 'daily-report');
      const reviewComment = '请补充今天完成工作的具体进展。';
      dailyReport = { ...dailyReport, status: 'rejected', reviewComment };
      await page.reload();
      await page.getByText('已退回', { exact: true }).waitFor();
      await page.getByText(reviewComment, { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('记录今天完成或推进的工作').isDisabled(), false, 'rejected reports remain editable');
      dailyReport = { ...dailyReport, status: 'approved' };
      const staleDraft = [{ sectionKey: 'today', title: '今日工作', contentMd: '不应覆盖已审核日报的旧本机草稿', sortOrder: 0 }];
      await page.evaluate(({ reportDate, draft }) => {
        localStorage.setItem(`xmt:safe-draft:v1:user:1:daily:${reportDate}`, JSON.stringify({ savedAt: Date.now(), value: draft }));
      }, { reportDate: dailyReport.reportDate, draft: staleDraft });
      await page.reload();
      await page.getByText('已通过', { exact: true }).waitFor();
      await page.getByText('日报已通过审核，当前为只读状态。', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('记录今天完成或推进的工作').isDisabled(), true, 'approved reports are read-only');
      await page.getByText('日报当前为只读状态，本机未提交草稿未应用且仍保留在本机。', { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder('记录今天完成或推进的工作').inputValue(), '完成日报保存与提交恢复验收', 'approved reports render server content instead of a stale local draft');
      assert.equal(await page.evaluate((reportDate) => localStorage.getItem(`xmt:safe-draft:v1:user:1:daily:${reportDate}`)?.includes('不应覆盖已审核日报的旧本机草稿'), dailyReport.reportDate), true, 'read-only review must preserve local drafts without applying them');
      if (width === 320) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: '/tmp/xmt-mobile-daily-partial-success-320.png', fullPage: true });
      }

      assert.deepEqual(errors, [], `viewport ${width}: ${errors.join('\n')}`);
      console.log(`Mobile work-center browser checks passed at ${width}px`, { hub, calendar, ideas, kanban, daily });
    } finally {
      await context.close();
    }
  }

  for (const width of [320, 390]) {
    const { context, page, errors } = await openMobilePage(width);
    try {
      await page.goto(`${baseUrl}/shooting`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '成片制作' }).waitFor();
      await page.getByText(/状态待确认/).waitFor();
      assert.equal(await page.getByText('legacy_transcoding', { exact: true }).count(), 0, 'shooting list must not expose an unknown raw status');
      const shootingList = await assertMobileLayout(page, width, 'shooting-status-list');
      await page.getByRole('button', { name: '查看', exact: true }).click();
      await page.waitForURL(`**/shooting/${shootingStatusFixture.id}`);
      await page.getByRole('heading', { level: 1, name: shootingStatusFixture.topic_title, exact: true }).waitFor();
      await page.getByText('状态待确认', { exact: true }).waitFor();
      assert.equal(await page.getByText('legacy_transcoding', { exact: true }).count(), 0, 'shooting detail must not expose an unknown raw status');
      const shootingDetail = await assertMobileLayout(page, width, 'shooting-status-detail');

      await page.goto(`${baseUrl}/publishing`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '发布管理' }).waitFor();
      await page.getByText('状态待确认', { exact: true }).waitFor();
      assert.equal(await page.getByText('legacy_verifying', { exact: true }).count(), 0, 'publishing list must not expose an unknown raw status');
      const publishingList = await assertMobileLayout(page, width, 'publishing-status-list');
      await page.getByRole('button', { name: /状态映射发布任务/ }).click();
      await page.waitForURL(`**/publishing/${publishingStatusFixture.id}`);
      await page.getByText(`发布管理详情 · 关联选题 #${linkedTopic.id}`, { exact: true }).waitFor();
      const publishingDetailFallbackCount = await page.getByText('状态待确认', { exact: true }).count();
      assert(publishingDetailFallbackCount >= 1, 'publishing detail shows the safe fallback');
      assert.equal(await page.getByText('legacy_verifying', { exact: true }).count(), 0, 'publishing detail must not expose an unknown raw status');
      assert.equal(await page.getByText('legacy_transcoding', { exact: true }).count(), 0, 'linked shooting detail must not expose an unknown raw status');
      if (width === 320) await page.screenshot({ path: '/tmp/xmt-mobile-publishing-status-detail-320.png', fullPage: true });
      const publishingDetail = await assertMobileLayout(page, width, 'publishing-status-detail');

      assert.deepEqual(errors, [], `workflow status viewport ${width}: ${errors.join('\n')}`);
      console.log(`Mobile workflow status checks passed at ${width}px`, { shootingList, shootingDetail, publishingList, publishingDetail });
    } finally {
      await context.close();
    }
  }

  {
    const { context, page, errors } = await openMobilePage(320);
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      await page.getByText(unknownStatusTopic.title, { exact: true }).waitFor();
      await page.getByText('状态待确认', { exact: true }).waitFor();
      assert.equal(await page.getByText('legacy_review', { exact: true }).count(), 0, 'mobile home must not expose an unknown topic status');
      await assertMobileLayout(page, 320, 'home-unknown-status');
      await page.goto(`${baseUrl}/topics`, { waitUntil: 'domcontentloaded' });
      await page.getByText(unknownStatusTopic.title, { exact: true }).waitFor();
      const listFallback = page.getByText('状态待确认', { exact: true });
      await listFallback.waitFor();
      assert((await listFallback.getAttribute('class') || '').includes('bg-studio-surface-soft'), 'unknown topic list status uses a neutral surface token');
      assert.equal(await page.getByText('legacy_review', { exact: true }).count(), 0, 'mobile topic list must not expose unknown raw status');
      await assertMobileLayout(page, 320, 'topics-unknown-status-list');
      await page.getByRole('button', { name: new RegExp(unknownStatusTopic.title) }).click();
      await page.waitForURL(`**/topics/${unknownStatusTopic.id}`);
      await page.getByLabel('选题标题').waitFor();
      const detailFallback = page.getByText('状态待确认', { exact: true });
      await detailFallback.waitFor();
      assert((await detailFallback.getAttribute('class') || '').includes('bg-studio-surface-soft'), 'unknown topic detail status uses a neutral surface token');
      assert.equal(await page.getByText('legacy_review', { exact: true }).count(), 0, 'mobile topic detail must not expose an unknown raw status or render a blank label');
      await assertMobileLayout(page, 320, 'topic-unknown-status-detail');
      assert.deepEqual(errors, [], `unknown topic status viewport: ${errors.join('\n')}`);
    } finally {
      await context.close();
    }
  }

  {
    const previousPermissions = fixturePermissions;
    fixturePermissions = ['production:view'];
    const { context, page, errors } = await openMobilePage(320);
    try {
      await page.goto(`${baseUrl}/production/content`, { waitUntil: 'domcontentloaded' });
      await page.getByText(unknownStatusProductionFixture.topic_title, { exact: true }).waitFor();
      await page.getByText(/状态待确认/).waitFor();
      assert.equal(await page.getByText('legacy_draft', { exact: true }).count(), 0, 'mobile production list must not expose an unknown raw status');
      await assertMobileLayout(page, 320, 'production-unknown-status-list');
      assert.deepEqual(errors, [], `unknown production status viewport: ${errors.join('\n')}`);
    } finally {
      fixturePermissions = previousPermissions;
      await context.close();
    }
  }

  const roleCases = [
    { role: 'director', id: 2, name: '负责人只读验收', permissions: ['production:view', 'production:update'], canEdit: false },
    { role: 'editor', id: 3, name: '内容编辑验收', permissions: ['production:view', 'production:update'], canEdit: true },
  ] as const;
  for (const roleCase of roleCases) {
    fixtureUser = { ...user, id: roleCase.id, username: `mobile-${roleCase.role}-qa`, name: roleCase.name, role: roleCase.role };
    fixturePermissions = [...roleCase.permissions];
    const { context, page, errors } = await openMobilePage(390, fixtureUser);
    let productionWrites = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/workflow/production/780') && request.method() === 'PUT') productionWrites += 1;
    });
    try {
      await page.goto(`${baseUrl}/production/content/${mobileProductionFixture.id}`, { waitUntil: 'domcontentloaded' });
      assert.equal(new URL(page.url()).pathname, `/production/content/${mobileProductionFixture.id}`, `${roleCase.role} should stay on the requested editor route`);
      assert((await page.title()).trim().length > 0, 'app page title is present');
      assert.equal(await page.locator('vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count(), 0, 'no framework error overlay is present');
      const editor = page.locator('.ProseMirror').first();
      await editor.waitFor();
      if (roleCase.canEdit) {
        await page.getByRole('button', { name: '保存草稿' }).waitFor();
        assert.equal(await page.getByText('只读模式：当前账号仅可查看。').count(), 0);
        assert.equal(await editor.getAttribute('contenteditable'), 'true');
      } else {
        await page.getByText('只读模式：当前账号仅可查看。').waitFor();
        assert.equal(await page.getByRole('button', { name: '保存草稿' }).count(), 0);
        assert.equal(await page.getByRole('button', { name: '提交审核' }).count(), 0);
        assert.equal(await editor.getAttribute('contenteditable'), 'false');
        await editor.click();
        assert.equal(await editor.getAttribute('contenteditable'), 'false', 'clicking the read-only body cannot enable editing');
        await page.screenshot({ path: '/tmp/xmt-mobile-production-director-readonly-390.png' });
      }
      assert.equal(productionWrites, 0, `${roleCase.role} fixture made no production update request`);
      assert.deepEqual(errors, [], `${roleCase.role} viewport: ${errors.join('\n')}`);
    } finally {
      await context.close();
    }
  }

  const mobileRoleLabels = [
    { role: 'copywriter', id: 7, name: '文案角色验收', label: '文案' },
    { role: 'post_production', id: 8, name: '后期角色验收', label: '后期' },
    { role: 'camera', id: 9, name: '摄像角色验收', label: '摄像' },
  ] as const;
  for (const roleCase of mobileRoleLabels) {
    fixtureUser = { ...user, id: roleCase.id, username: `mobile-${roleCase.role}-qa`, name: roleCase.name, role: roleCase.role };
    fixturePermissions = [];
    const { context, page, errors } = await openMobilePage(390, fixtureUser);
    try {
      await page.goto(`${baseUrl}/me`, { waitUntil: 'domcontentloaded' });
      await page.getByText(roleCase.label, { exact: true }).waitFor();
      assert.equal(await page.getByText(roleCase.role, { exact: true }).count(), 0, `${roleCase.role} should not appear as a raw role label`);
      assert.deepEqual(errors, [], `${roleCase.role} account viewport: ${errors.join('\n')}`);
    } finally {
      await context.close();
    }
  }

  const topicCreator = { ...user, id: 4, username: 'mobile-topic-creator', name: '选题提报验收', role: 'member' };
  fixtureUser = topicCreator;
  fixturePermissions = ['topic:create'];
  const { context: creatorContext, page: creatorPage, errors: creatorErrors, expectConsoleFailure: expectCreatorFailure } = await openMobilePage(390, topicCreator);
  try {
    await creatorPage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const titleInput = creatorPage.getByPlaceholder('输入清晰、可执行的选题标题');
    await titleInput.waitFor();
    const title = '移动提报失败后仍可重试';
    await titleInput.fill(title);
    expectCreatorFailure();
    const failedCreate = creatorPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 503);
    await creatorPage.getByRole('button', { name: '提交选题' }).click();
    await failedCreate;
    await creatorPage.getByText('选题服务暂不可用，已保留本次输入', { exact: true }).waitFor();
    assert.equal(await titleInput.inputValue(), title, 'failed create keeps the entered topic title');
    assert.equal(topicCreateAttempts.get(title), 1);
    const successfulCreate = creatorPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/topics') && response.status() === 200);
    await creatorPage.getByRole('button', { name: '提交选题' }).click();
    await successfulCreate;
    await creatorPage.waitForURL('**/topics');
    assert.equal(topicCreateAttempts.get(title), 2, 'retry submits exactly once after the failure');
    assert.deepEqual(creatorErrors, [], creatorErrors.join('\n'));
  } finally {
    await creatorContext.close();
  }

  const topicEditor = { ...user, id: 5, username: 'mobile-topic-editor', name: '选题编辑验收', role: 'member' };
  fixtureUser = topicEditor;
  fixturePermissions = ['topic:update'];
  const { context: editorContext, page: editorPage, errors: editorErrors, expectConsoleFailure: expectEditorFailure } = await openMobilePage(390, topicEditor);
  let editableTopicDetailReads = 0;
  editorPage.on('request', (request) => {
    if (request.method() === 'GET' && request.url().endsWith(`/api/topics/${editableTopic.id}`)) editableTopicDetailReads += 1;
  });
  try {
    await editorPage.goto(`${baseUrl}/topics/${editableTopic.id}`, { waitUntil: 'domcontentloaded' });
    await editorPage.getByRole('button', { name: '保存修改' }).waitFor();
    const titleInput = editorPage.getByLabel('选题标题');
    await editorPage.waitForTimeout(250);
    assert(editableTopicDetailReads <= 3, `topic permission/load updates must settle instead of refetching indefinitely (reads=${editableTopicDetailReads})`);
    const changedTitle = '移动编辑重载后恢复';
    await titleInput.fill(changedTitle);
    await editorPage.waitForFunction(() => {
      const raw = localStorage.getItem('xmt:safe-draft:v1:user:5:topic:904:edit');
      return Boolean(raw && JSON.parse(raw).value?.title === '移动编辑重载后恢复');
    });
    expectEditorFailure();
    const failedUpdate = editorPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/topics/${editableTopic.id}`) && response.status() === 503);
    await editorPage.getByRole('button', { name: '保存修改' }).click();
    await failedUpdate;
    await editorPage.getByText('保存服务暂不可用，请稍后重试', { exact: true }).waitFor();
    await editorPage.reload({ waitUntil: 'domcontentloaded' });
    await editorPage.getByText('已恢复未提交的本地修改；确认后再保存到服务器。', { exact: true }).waitFor();
    assert.equal(await titleInput.inputValue(), changedTitle, 'failed update draft survives reload for an authorized owner');
    await editorPage.getByRole('button', { name: '保存修改' }).click();
    await editorPage.getByText('已保存', { exact: true }).waitFor();
    assert.equal(await editorPage.evaluate(() => localStorage.getItem('xmt:safe-draft:v1:user:5:topic:904:edit')), null, 'successful retry clears the recovered topic edit draft');
    assert.equal(topicUpdateAttempts, 2);
    assert.deepEqual(editorErrors, [], editorErrors.join('\n'));
  } finally {
    await editorContext.close();
  }

  const topicAuditor = { ...user, id: 6, username: 'mobile-topic-auditor', name: '独立审核验收', role: 'director' };
  fixtureUser = topicAuditor;
  fixturePermissions = ['topic:audit'];
  const { context: auditorContext, page: auditorPage, errors: auditorErrors, expectConsoleFailure: expectAuditorFailure } = await openMobilePage(390, topicAuditor);
  try {
    await auditorPage.goto(`${baseUrl}/topics/${auditableTopic.id}`, { waitUntil: 'domcontentloaded' });
    await auditorPage.getByRole('button', { name: '开始审核' }).click();
    assert.equal(await auditorPage.getByRole('button', { name: '保存修改' }).count(), 0, 'audit permission does not grant content editing');
    await auditorPage.getByRole('button', { name: '驳回', exact: true }).click();
    const comment = '请补充选题依据后再提交';
    await auditorPage.getByPlaceholder('填写通过说明或需要修改的内容').fill(comment);
    expectAuditorFailure();
    const failedAudit = auditorPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/topics/${auditableTopic.id}/audit`) && response.status() === 503);
    await auditorPage.getByRole('button', { name: '确认驳回选题' }).click();
    await failedAudit;
    await auditorPage.getByText('审核服务暂不可用，请稍后重试', { exact: true }).waitFor();
    assert.equal(await auditorPage.getByPlaceholder('填写通过说明或需要修改的内容').inputValue(), comment, 'failed audit keeps the decision and review comment available');
    await auditorPage.getByText('审核服务暂不可用，请稍后重试', { exact: true }).scrollIntoViewIfNeeded();
    await auditorPage.screenshot({ path: '/tmp/xmt-mobile-topic-audit-failure-390.png' });
    await auditorPage.getByRole('button', { name: '确认驳回选题' }).click();
    await auditorPage.getByText('已驳回', { exact: true }).waitFor();
    assert.deepEqual(topicAuditComments, [comment, comment], 'audit retry sends the unchanged review comment exactly once more');
    assert.deepEqual(auditorErrors, [], auditorErrors.join('\n'));
  } finally {
    await auditorContext.close();
  }

  const messageUser = { ...user, id: 8, username: 'mobile-message-recovery', name: '消息恢复验收', role: 'member' };
  fixtureUser = messageUser;
  fixturePermissions = [];
  mobileMessagesFixture = [];
  messageLoadFailures = 1;
  const { context: messageErrorContext, page: messageErrorPage, errors: messageErrorErrors, expectConsoleFailure: expectMessageLoadFailure } = await openMobilePage(390, messageUser);
  try {
    expectMessageLoadFailure();
    const failedMessageLoad = messageErrorPage.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes('/api/messages?') && response.status() === 503);
    await messageErrorPage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
    await failedMessageLoad;
    await messageErrorPage.getByRole('heading', { name: '消息加载失败' }).waitFor();
    assert.equal(await messageErrorPage.getByText('暂无消息', { exact: true }).count(), 0, 'a failed request without cache must not look like an empty inbox');
    await messageErrorPage.screenshot({ path: '/tmp/xmt-mobile-message-load-error-390.png', fullPage: true });
    await messageErrorPage.getByRole('button', { name: '重试加载' }).click();
    await messageErrorPage.getByText('暂无消息', { exact: true }).waitFor();
    assert.deepEqual(messageErrorErrors, [], messageErrorErrors.join('\n'));
  } finally {
    await messageErrorContext.close();
  }

  mobileMessagesFixture = [{ id: 992, title: '需重试的工作提醒', content: '标记失败时应保留在消息页', read: false, link: `/topics/${linkedTopic.id}` }];
  messageReadFailures = 1;
  messageReadAttempts = 0;
  const { context: messageReadContext, page: messageReadPage, errors: messageReadErrors, expectConsoleFailure: expectMessageReadFailure } = await openMobilePage(390, messageUser);
  try {
    await messageReadPage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
    const messageCard = messageReadPage.getByRole('button', { name: /需重试的工作提醒/ });
    await messageCard.waitFor();
    expectMessageReadFailure();
    const failedMessageRead = messageReadPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/messages/992') && response.status() === 503);
    await messageCard.click();
    await failedMessageRead;
    assert.equal(await messageReadPage.getByText('标记消息失败', { exact: true }).count(), 1, 'mark failure remains visible on the inbox');
    assert.equal(await messageReadPage.url(), `${baseUrl}/messages`, 'failed mark must not navigate away from its recovery message');
    const successfulMessageRead = messageReadPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/messages/992') && response.status() === 200);
    await messageCard.click();
    await successfulMessageRead;
    await messageReadPage.waitForURL(`**/topics/${linkedTopic.id}`);
    assert.equal(messageReadAttempts, 2, 'failed mark is retried exactly once before navigation');
    assert.deepEqual(messageReadErrors, [], messageReadErrors.join('\n'));
  } finally {
    await messageReadContext.close();
  }

  const passwordUser = { ...user, id: 9, username: 'mobile-password-recovery', name: '密码恢复验收', role: 'member' };
  fixtureUser = passwordUser;
  passwordChangeAttempts = 0;
  passwordChangeFailures = 1;
  const { context: passwordContext, page: passwordPage, errors: passwordErrors, expectConsoleFailure: expectPasswordFailure } = await openMobilePage(390, passwordUser);
  try {
    await passwordPage.goto(`${baseUrl}/me`, { waitUntil: 'domcontentloaded' });
    await passwordPage.getByRole('button', { name: '账号安全' }).click();
    await passwordPage.getByPlaceholder('当前密码').waitFor();
    await passwordPage.getByRole('button', { name: '更新密码' }).click();
    await passwordPage.getByText('请输入当前密码。', { exact: true }).waitFor();
    await passwordPage.getByPlaceholder('当前密码').fill('current-pass');
    await passwordPage.getByPlaceholder('新密码（至少 6 位）').fill('12345');
    await passwordPage.getByRole('button', { name: '更新密码' }).click();
    await passwordPage.getByText('新密码至少 6 位。', { exact: true }).waitFor();
    assert.equal(passwordChangeAttempts, 0, 'invalid password input must not call the service');
    await passwordPage.getByPlaceholder('新密码（至少 6 位）').fill('123456');
    expectPasswordFailure();
    const failedPasswordUpdate = passwordPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/auth/change-password') && response.status() === 503);
    await passwordPage.getByRole('button', { name: '更新密码' }).dblclick();
    await failedPasswordUpdate;
    await passwordPage.getByText('密码服务暂不可用，请重试', { exact: true }).waitFor();
    assert.equal(passwordChangeAttempts, 1, 'double-click submits only once while the request is pending');
    await passwordPage.getByText('密码服务暂不可用，请重试', { exact: true }).scrollIntoViewIfNeeded();
    await passwordPage.screenshot({ path: '/tmp/xmt-mobile-password-retry-390.png' });
    const successfulPasswordUpdate = passwordPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/auth/change-password') && response.status() === 200);
    await passwordPage.getByRole('button', { name: '更新密码' }).click();
    await successfulPasswordUpdate;
    await passwordPage.getByText('密码已更新。', { exact: true }).waitFor();
    assert.equal(await passwordPage.getByPlaceholder('当前密码').isVisible(), true, 'the password form stays open so success feedback is visible');
    await passwordPage.getByText('密码已更新。', { exact: true }).scrollIntoViewIfNeeded();
    await passwordPage.screenshot({ path: '/tmp/xmt-mobile-password-success-390.png' });
    assert.equal(passwordChangeAttempts, 2, 'retry follows the single failed request');
    assert.deepEqual(passwordErrors, [], passwordErrors.join('\n'));
  } finally {
    await passwordContext.close();
  }

  // A shared phone must never restore another account's cached messages or drafts.
  const secondUser = { ...user, id: 7, username: 'mobile-second-user', name: '第二位成员', role: 'member' };
  fixtureUser = secondUser;
  fixturePermissions = ['topic:create', 'report:daily:submit'];
  mobileMessagesFixture = [];
  dailyReport = createDailyReport();
  const { context: sharedContext, page: sharedPage, errors: sharedErrors } = await openMobilePage(390, secondUser);
  try {
    await sharedPage.addInitScript((reportDate) => {
      localStorage.setItem('xmt:safe-draft:v1:messages:recent', JSON.stringify({ savedAt: Date.now(), value: [{ id: 998, title: '旧版账号私密消息', content: '不得显示', read: false }] }));
      localStorage.setItem('xmt:safe-draft:v1:user:1:messages:recent', JSON.stringify({ savedAt: Date.now(), value: [{ id: 999, title: '其他账号私密消息', content: '不得显示', read: false }] }));
      localStorage.setItem('xmt:safe-draft:v1:topic:new', JSON.stringify({ savedAt: Date.now(), value: { title: '旧版账号的选题草稿' } }));
      localStorage.setItem('xmt:safe-draft:v1:user:1:topic:new', JSON.stringify({ savedAt: Date.now(), value: { title: '其他账号的选题草稿' } }));
      localStorage.setItem(`xmt:safe-draft:v1:user:1:daily:${reportDate}`, JSON.stringify({ savedAt: Date.now(), value: [{ sectionKey: 'today', title: '今日工作', contentMd: '其他账号的日报内容', sortOrder: 0 }] }));
    }, dailyReport.reportDate);
    await sharedPage.goto(`${baseUrl}/messages`, { waitUntil: 'domcontentloaded' });
    await sharedPage.getByText('暂无消息', { exact: true }).waitFor();
    assert.equal(await sharedPage.getByText('其他账号私密消息').count(), 0);
    assert.equal(await sharedPage.getByText('旧版账号私密消息').count(), 0);
    await sharedPage.goto(`${baseUrl}/topics/add`, { waitUntil: 'domcontentloaded' });
    const sharedTopicTitle = sharedPage.getByPlaceholder('输入清晰、可执行的选题标题');
    await sharedTopicTitle.waitFor();
    assert.equal(await sharedTopicTitle.inputValue(), '', 'another account’s topic draft must not be restored');
    await sharedPage.goto(`${baseUrl}/daily-report`, { waitUntil: 'domcontentloaded' });
    await sharedPage.getByText(/· 我的日报/).waitFor();
    assert.notEqual(await sharedPage.getByPlaceholder('记录今天完成或推进的工作').inputValue(), '其他账号的日报内容');
    await assertMobileLayout(sharedPage, 390, 'shared-device-account-isolation');
    assert.deepEqual(sharedErrors, [], sharedErrors.join('\n'));
  } finally {
    await sharedContext.close();
  }
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
