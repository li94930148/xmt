import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { buildCreatorTopicSuggestions } from '../../api/services/creatorTopicSuggestions.js';
import { analyzeDouyinWorks } from '../../api/services/douyinOperationsAnalytics.js';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 1, username: 'suggestion-qa', role: 'admin', name: '创作建议验收', enabled: true, force_change_password: false };
let mode: 'ready' | 'failed' | 'empty' | 'no-create' | 'no-view' | 'feedback-delayed' = 'ready';
let dashboardRequests = 0;
let feedbackOutcome: 'adopted' | 'not_adopted' | null = null;
let feedbackRequests = 0;
let feedbackPostMode: 'ready' | 'not-committed' | 'committed-response-lost' = 'ready';
let feedbackReadFailures = 0;
let feedbackReadbackOverride: 'normal' | 'stale-evidence' | 'other-outcome' = 'normal';
let topicWrites = 0;
const topicCreateReceipts = new Map<string, { actorId: number; topicId: number }>();
const topicRequestIds: string[] = [];
let bindingCodeMode: 'ready' | 'delayed' | 'failed' | 'committed-response-lost' = 'ready';
let bindingCodeRequests = 0;
let lastBindingAccountId = '';
const bindingDelayByAccount = new Map<string, number>();
const bindingReceipts = new Map<string, { accountId: string; code: string; expiresAt: string; active: boolean }>();
let failNextUserDirectoryRead = false;
let userDirectoryReads = 0;
let delayedDashboardAccount = '';
let delayDashboardMs = 0;
let lastTopic: Record<string, unknown> = {};
const now = new Date();
const works = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1, account_id: 1, title: index < 3 ? `老街故事 ${index + 1} #老街` : `城市记录 ${index + 1}`,
  publish_time: new Date(now.getTime() - 14 * 86400000).toISOString(), updated_at: now.toISOString(),
  play_count: index < 3 ? 3000 : 1000, like_count: 0, comment_count: 0, share_count: 0, collect_count: 0, completion_rate: 0,
}));
const data = buildCreatorTopicSuggestions(works, 'suggestion-fixture', now);
const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  if (req.query.mode === 'no-create') mode = 'no-create';
  else if (req.query.mode === 'ready' || (req.query.mode === undefined && mode === 'no-create')) mode = 'ready';
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','browser-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/analytics/creator-center');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(mode === 'no-create' || mode === 'no-view' ? { ...user, role: 'reporter' } : user));
app.get('/api/permissions/my', (_req, res) => res.json(mode === 'no-view' ? ['topic:create', 'topic:view'] : ['creator:data:view', 'topic:view']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/users', (_req, res) => {
  userDirectoryReads++;
  if (failNextUserDirectoryRead) {
    failNextUserDirectoryRead = false;
    return res.status(503).json({ message: '验收模拟：负责人名单暂不可用' });
  }
  return res.json({ data: [user], total: 1, page: 1, limit: 20 });
});
app.get('/api/topics', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));
app.get(/^\/api\/topics\/create-requests\/([0-9a-f-]+)$/i, (req, res) => {
  const requestId = String(req.params[0] || '').toLowerCase();
  const receipt = topicCreateReceipts.get(requestId);
  if (!receipt || receipt.actorId !== user.id) return res.json({ state: 'not_found' });
  return res.json({ state: 'created', topicId: receipt.topicId });
});
app.post('/api/topics', (req, res) => {
  topicWrites++;
  lastTopic = req.body;
  const requestId = String(req.body?.client_request_id ?? '').toLowerCase();
  topicRequestIds.push(requestId);
  if (topicWrites === 1) return res.status(503).json({ message: '验收模拟：提报响应结果不明' });
  topicCreateReceipts.set(requestId, { actorId: user.id, topicId: 906 });
  return res.json({ message: '选题创建成功', data: { topicId: 906 } });
});
app.get('/api/creator-agent/status', (_req, res) => res.json({ agents: [], protocol_version: 1 }));
app.get('/api/creator-agent/douyin/sync-logs', (_req, res) => res.json([]));
app.post('/api/creator-agent/binding-codes', async (req, res) => {
  bindingCodeRequests++;
  const requestNumber = bindingCodeRequests;
  const accountId = String(req.body?.account_id || '');
  lastBindingAccountId = accountId;
  const requestId = String(req.body?.request_id || '');
  if (bindingCodeMode === 'delayed') await new Promise(resolve => setTimeout(resolve, bindingDelayByAccount.get(accountId) ?? 150));
  if (bindingCodeMode === 'failed') { res.status(503).json({ message: '验收模拟：绑定码创建暂不可用' }); return; }
  const existing = requestId ? bindingReceipts.get(requestId) : undefined;
  if (existing && existing.accountId !== accountId) { res.status(409).json({ message: '请求编号账号范围不匹配' }); return; }
  if (existing && !existing.active) { res.status(410).json({ message: '绑定码已使用或过期' }); return; }
  let receipt = existing;
  if (!receipt) {
    for (const saved of bindingReceipts.values()) if (saved.accountId === accountId) saved.active = false;
    receipt = { accountId, code: `ONE_TIME_${requestNumber}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), active: true };
    if (requestId) bindingReceipts.set(requestId, receipt);
  }
  if (bindingCodeMode === 'committed-response-lost') {
    bindingCodeMode = 'ready';
    res.socket?.destroy();
    return;
  }
  res.status(201).json({ binding_code: receipt.code, expires_at: receipt.expiresAt, one_time: true });
});
app.get('/api/creator-agent/binding-codes/requests/:requestId', (req, res) => {
  const receipt = bindingReceipts.get(String(req.params.requestId || ''));
  if (!receipt || receipt.accountId !== String(req.query.account_id || '')) { res.json({ status: 'not_found' }); return; }
  if (!receipt.active) { res.json({ status: 'used', expires_at: receipt.expiresAt }); return; }
  res.json({ status: 'active', binding_code: receipt.code, expires_at: receipt.expiresAt, one_time: true });
});
app.get('/api/creator-agent/douyin/works/:id/review', (req, res) => {
  if (req.query.account_id !== data.account_uid) { res.status(404).json({ message: '样本账号范围未保留' }); return; }
  const work = analyzeDouyinWorks(works).works.find(row => row.id === Number(req.params.id));
  if (!work) { res.sendStatus(404); return; }
  res.json({ work: { ...work, aweme_id: `fixture-${work.id}`, cover_url: '', duration: 0 }, performance: work.performance, snapshots: [] });
});
app.get('/api/creator-agent/douyin/dashboard', async (req, res) => {
  dashboardRequests++;
  if (mode === 'failed') { res.status(503).json({ message: '验收模拟：创作数据暂不可用' }); return; }
  const requestedAccountId = String(req.query.account_id || data.account_uid);
  if (requestedAccountId === data.account_uid && feedbackReadFailures > 0) {
    feedbackReadFailures--;
    res.status(503).json({ message: '验收模拟：反馈状态暂不可用' });
    return;
  }
  if (requestedAccountId !== data.account_uid) {
    if (requestedAccountId !== 'slow-account' && requestedAccountId !== 'fast-account') { res.status(404).json({ message: '账号不可用' }); return; }
    const delayMs = requestedAccountId === delayedDashboardAccount ? delayDashboardMs : 0;
    if (delayMs > 0) { delayDashboardMs = 0; await new Promise(resolve => setTimeout(resolve, delayMs)); }
    const slow = requestedAccountId === 'slow-account';
    res.json({ account: { nickname: slow ? '慢速账号' : '快速账号', douyin_uid: requestedAccountId }, metrics: { fans_count: null, works_count: 0, play_count: slow ? 111 : 222, interaction_rate: 0, share_rate: 0, viral_works_count: 0 }, data_status: 'partial', data_source: 'douyin_creator_center_collection', last_success_at: now.toISOString(), top_works: [], snapshot_count: 0, topic_suggestions: { ...data, account_uid: requestedAccountId, status: 'empty', items: [] } });
    return;
  }
  const dashboardFeedbackOutcome = feedbackReadbackOverride === 'other-outcome'
    ? feedbackOutcome === 'adopted' ? 'not_adopted' : 'adopted'
    : feedbackOutcome;
  const feedback = { my_outcome: dashboardFeedbackOutcome, adopted_count: dashboardFeedbackOutcome === 'adopted' ? 1 : 0, not_adopted_count: dashboardFeedbackOutcome === 'not_adopted' ? 1 : 0 };
  const suggestions = { ...data, items: data.items.map(item => ({ ...item, evidence_id: feedbackReadbackOverride === 'stale-evidence' && item === data.items[0] ? 'f'.repeat(32) : item.evidence_id, feedback })) };
  res.json({ account: { nickname: '创作建议验收账号', douyin_uid: data.account_uid }, metrics: { fans_count: null, works_count: 6, play_count: 12000, interaction_rate: 0, share_rate: 0, viral_works_count: 0 }, data_status: 'partial', data_source: 'douyin_creator_center_collection', last_success_at: now.toISOString(), top_works: [], snapshot_count: 0, topic_suggestions: mode === 'empty' ? { ...suggestions, items: [], status: 'insufficient_data' } : suggestions });
});
app.post('/api/creator-agent/douyin/suggestions/:id/feedback', async (req, res) => {
  feedbackRequests++;
  const responseMode = feedbackPostMode;
  feedbackPostMode = 'ready';
  if (mode === 'feedback-delayed') await new Promise(resolve => setTimeout(resolve, 150));
  if (responseMode === 'not-committed') { res.status(503).json({ message: '验收模拟：反馈明确未写入' }); return; }
  if (req.params.id !== data.items[0]?.id || req.body?.evidence_id !== data.items[0]?.evidence_id) { res.status(409).json({ message: '样本已更新' }); return; }
  feedbackOutcome = req.body.outcome;
  if (responseMode === 'committed-response-lost') { res.socket?.destroy(); return; }
  res.json({ feedback: { my_outcome: feedbackOutcome, adopted_count: feedbackOutcome === 'adopted' ? 1 : 0, not_adopted_count: feedbackOutcome === 'not_adopted' ? 1 : 0 } });
});
const server = http.createServer(app);
const io = new Server(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

function colorChannels(value: string) {
  const channels = value.match(/[\d.]+/g)?.map(Number) || [];
  return channels.length >= 3 ? { rgb: channels.slice(0, 3), alpha: channels[3] ?? 1 } : null;
}

function luminance(rgb: number[]) {
  return rgb.map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + [0.2126, 0.7152, 0.0722][index] * value, 0);
}

function contrastRatio(foreground: number[], background: number[]) {
  const foregroundLum = luminance(foreground);
  const backgroundLum = luminance(background);
  return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05);
}
async function installDashboardCacheSpy(page: Page) {
  await page.addInitScript(() => {
    const target = window as Window & { __xmtDashboardFetchCaches?: Array<RequestCache | undefined> };
    target.__xmtDashboardFetchCaches = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes('/api/creator-agent/douyin/dashboard')) target.__xmtDashboardFetchCaches?.push(init?.cache);
      return originalFetch(input, init);
    };
  });
}
async function suppressSessionStorageMarkerWrite(page: Page, key: string) {
  await page.evaluate((targetKey) => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, '__xmtOriginalSessionStorageSetItem', { configurable: true, value: original });
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      writable: true,
      value(this: Storage, itemKey: string, value: string) {
        if (this === window.sessionStorage && itemKey === targetKey) return;
        return original.call(this, itemKey, value);
      },
    });
  }, key);
}
async function restoreSessionStorageMarkerWrite(page: Page) {
  await page.evaluate(() => {
    const target = window as Window & { __xmtOriginalSessionStorageSetItem?: typeof Storage.prototype.setItem };
    if (target.__xmtOriginalSessionStorageSetItem) {
      Object.defineProperty(Storage.prototype, 'setItem', { configurable: true, writable: true, value: target.__xmtOriginalSessionStorageSetItem });
      delete target.__xmtOriginalSessionStorageSetItem;
    }
  });
}
async function assertCreatorDashboardLayout(page: Page, width: number) {
  const overview = page.getByTestId('creator-account-overview');
  const compactProfile = page.getByTestId('creator-profile-compact');
  const desktopProfile = page.getByTestId('creator-profile-desktop');
  assert.equal(await overview.count(), 1, 'the account overview is unique');
  assert.equal(await compactProfile.isVisible(), width < 1024, `compact identity matches the ${width}px viewport`);
  assert.equal(await desktopProfile.isVisible(), width >= 1024, `ReactBits profile matches the ${width}px viewport`);
  if (width < 1024) {
    const viewWorks = compactProfile.getByRole('button', { name: '查看作品', exact: true });
    const viewWorksBox = await viewWorks.boundingBox();
    assert(viewWorksBox && viewWorksBox.height >= 40, 'compact profile keeps a 40px touch target for works');
  }

  const accountMetrics = page.getByTestId('creator-account-metrics');
  const expectedAccountColumns = width < 360 ? 2 : 3;
  const accountColumns = await accountMetrics.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  assert.equal(accountColumns, expectedAccountColumns, `account metrics use ${expectedAccountColumns} readable columns at ${width}px`);
  for (const label of ['粉丝', '入库作品', '累计播放']) {
    assert.equal(await accountMetrics.getByText(label, { exact: true }).count(), 1, `${label} appears once in account metrics`);
  }
  assert.equal(await accountMetrics.getByText('暂无数据', { exact: true }).count(), 1, 'the complete missing-data label remains visible at narrow widths');
  assert.equal(await accountMetrics.getByText('暂无数据', { exact: true }).evaluate(node => getComputedStyle(node).textOverflow), 'clip', 'missing account values are not ellipsized');
  const engagement = page.getByTestId('creator-engagement-metrics');
  for (const label of ['互动率', '分享率', '爆款作品']) {
    assert.equal(await engagement.getByText(label, { exact: true }).count(), 1, `${label} appears once in engagement metrics`);
  }
  for (const label of ['粉丝', '入库作品', '累计播放']) {
    assert.equal(await engagement.getByText(label, { exact: true }).count(), 0, `${label} is not duplicated in engagement metrics`);
  }

  const dataStatus = await page.getByTestId('creator-data-source-status').innerText();
  assert(!dataStatus.includes('6 条作品'), 'data source status does not repeat the account work count');
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assert(dimensions.scrollWidth <= dimensions.clientWidth, `${width}px dashboard has no horizontal overflow`);

  if (width < 1024) {
    const overviewBox = await overview.boundingBox();
    const maximumOverviewHeight = width < 360 ? 280 : 240;
    assert(overviewBox && overviewBox.height < maximumOverviewHeight, `compact account overview stays short, received ${overviewBox?.height ?? 'no box'}px at ${width}px`);
    const engagementBox = await engagement.boundingBox();
    const agentBox = await page.getByTestId('creator-agent-panel').boundingBox();
    assert(engagementBox && agentBox && agentBox.y > engagementBox.y, 'primary engagement data precedes the Creator Agent panel');
  }
}
if (process.env.XMT_TOPIC_QA_SERVE === '1') {
  console.log(`Isolated topic suggestion QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390, 320]) {
    mode = 'ready'; topicWrites = 0; topicCreateReceipts.clear(); topicRequestIds.length = 0; feedbackOutcome = null; feedbackPostMode = 'ready'; feedbackReadFailures = 0; feedbackReadbackOverride = 'normal'; feedbackRequests = 0; bindingCodeMode = 'ready'; bindingCodeRequests = 0; lastBindingAccountId = ''; bindingReceipts.clear(); bindingDelayByAccount.clear();
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const errors: string[] = [];
    const page = await context.newPage();
    await installDashboardCacheSpy(page);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('503') && !message.text().includes('ERR_EMPTY_RESPONSE') && !message.text().includes('ERR_CONNECTION_RESET')) errors.push(message.text()); });
    await page.goto(`${base}/__qa`);
    await page.getByRole('heading', { name: '数据指导创作', exact: true }).waitFor();
    await assertCreatorDashboardLayout(page, width);
    await page.getByText('约 3 倍。', { exact: false }).waitFor();
    const notAdopted = page.getByRole('button', { name: '暂不采用', exact: true });
    if (width === 1440) {
      const bindingRecoveryKey = `xmt.creator-agent.binding-recovery.v1:1:${encodeURIComponent(data.account_uid)}`;
      const bindingRequestCountBeforeStorageFailure = bindingCodeRequests;
      await suppressSessionStorageMarkerWrite(page, bindingRecoveryKey);
      await page.getByRole('button', { name: '创建一次性绑定码', exact: true }).click();
      await page.getByText('浏览器无法保留安全重试编号，未发送绑定码请求。请允许此站点使用会话存储后重试。', { exact: true }).waitFor();
      assert.equal(bindingCodeRequests, bindingRequestCountBeforeStorageFailure, 'a silent recovery-marker drop prevents the binding-code POST');
      assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), bindingRecoveryKey), null, 'a dropped binding recovery marker remains absent');
      await restoreSessionStorageMarkerWrite(page);

      bindingCodeMode = 'delayed';
      const binding = page.getByRole('button', { name: '创建一次性绑定码', exact: true });
      const bindingBefore = bindingCodeRequests;
      await binding.evaluate(button => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      const createdBindingCode = page.getByRole('status').filter({ hasText: 'ONE_TIME_1' });
      await createdBindingCode.waitFor();
      assert.equal(bindingCodeRequests, bindingBefore + 1, 'one-time binding code cannot be created twice by a rapid double trigger');
      assert.equal(lastBindingAccountId, data.account_uid, 'binding code is requested only for the selected Creator account');
      assert.match(await createdBindingCode.innerText(), /有效期至 .* · 仅可使用一次/, 'binding status shows the server-returned expiry rather than a fixed relative duration');
      bindingCodeMode = 'failed';
      const createAnotherBinding = page.getByRole('button', { name: '创建新绑定码（原码将失效）', exact: true });
      await createAnotherBinding.click();
      const ambiguousBindingMessage = '服务端是否已创建尚未确认；已保留原请求编号，请按原请求安全重试，不要另行重复签发。';
      await page.getByText(ambiguousBindingMessage, { exact: true }).waitFor();
      assert.equal(await page.getByText('ONE_TIME_1', { exact: true }).count(), 0, 'a new issuance attempt hides the prior code because server-side invalidation is uncertain');
      const safeRetry = page.getByRole('button', { name: '按原请求安全重试', exact: true });
      bindingCodeMode = 'ready';
      await safeRetry.click();
      await page.getByText('ONE_TIME_3', { exact: true }).waitFor();
      assert.equal(bindingCodeRequests, bindingBefore + 3, 'only the explicit retry creates another binding code');
      assert.equal(await page.getByText(ambiguousBindingMessage, { exact: true }).count(), 0, 'retry clears the previous binding error');
      const postCountBeforeLostResponse = bindingCodeRequests;
      bindingCodeMode = 'committed-response-lost';
      await page.getByRole('button', { name: '创建新绑定码（原码将失效）', exact: true }).click();
      await page.getByText(ambiguousBindingMessage, { exact: true }).waitFor();
      assert.equal(bindingCodeRequests, postCountBeforeLostResponse + 1, 'the lost-response scenario commits only one create request');
      const recoveryMarkers = await page.evaluate(() => Object.entries(window.sessionStorage)
        .filter(([key]) => key.startsWith('xmt.creator-agent.binding-recovery.v1:'))
        .map(([key, value]) => ({ key, value: JSON.parse(value) as Record<string, unknown> })));
      assert.equal(recoveryMarkers.length, 1, 'the browser stores one request marker for the current actor/account scope');
      assert.deepEqual(recoveryMarkers[0].value, {
        actorId: 1, accountId: data.account_uid, requestId: recoveryMarkers[0].value.requestId, ttlMinutes: 15,
      });
      assert(!JSON.stringify(recoveryMarkers).includes('ONE_TIME_'), 'the browser session marker never stores the plaintext binding code');
      await page.reload();
      await page.getByText(`ONE_TIME_${postCountBeforeLostResponse + 1}`, { exact: true }).waitFor();
      assert.equal(bindingCodeRequests, postCountBeforeLostResponse + 1, 'reload recovers the committed code through GET without issuing a duplicate POST');
      mode = 'feedback-delayed';
      feedbackPostMode = 'committed-response-lost';
      const before = feedbackRequests;
      const dashboardBefore = dashboardRequests;
      await notAdopted.evaluate(button => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      await page.getByText('你已标记为暂不采用', { exact: true }).waitFor();
      assert.equal(feedbackRequests, before + 1, 'same suggestion feedback cannot submit twice while delayed');
      assert.equal(dashboardRequests, dashboardBefore + 1, 'a lost feedback response is followed by one dashboard read, not a second POST');
      const cacheModes = await page.evaluate(() => (window as Window & { __xmtDashboardFetchCaches?: Array<RequestCache | undefined> }).__xmtDashboardFetchCaches || []);
      assert.equal(cacheModes.at(-1), 'no-store', 'feedback recovery bypasses the browser HTTP cache');
    } else {
      await notAdopted.click();
    }
    mode = 'ready';
    await page.getByText('你已标记为暂不采用', { exact: true }).waitFor();
    await page.getByText('暂不采用 1', { exact: false }).waitFor();
    await page.getByText('查看作品依据（两组各最多 3 条）', { exact: true }).click();
    assert.equal(await page.getByRole('link', { name: /^老街故事 1 #老街/ }).getAttribute('href'), '/analytics/creator-center/work/1?account_id=suggestion-fixture');
    if (width === 1440) {
      const popupReady = page.waitForEvent('popup');
      await page.getByRole('link', { name: /^老街故事 1 #老街/ }).click();
      const popup = await popupReady;
      await popup.getByRole('heading', { name: '老街故事 1 #老街', exact: true }).waitFor();
      await popup.close();
    }
    await page.getByRole('button', { name: '以此新建选题', exact: true }).click();
    await page.getByRole('button', { name: '将依据加入项目背景', exact: true }).waitFor();
    const title = page.getByPlaceholder(width === 1440 ? '请输入选题标题' : '输入清晰、可执行的选题标题');
    const background = page.getByPlaceholder(width === 1440 ? /请详细描述项目背景/ : '说明选题来源、场景和目标');
    await title.fill('保留已有草稿标题'); await background.fill('原有项目背景');
    await page.getByRole('button', { name: width === 1440 ? '存本机草稿' : '存本地草稿', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '将依据加入项目背景', exact: true }).waitFor();
    assert.equal(await title.inputValue(), '保留已有草稿标题');
    await page.getByRole('button', { name: '将依据加入项目背景', exact: true }).click();
    assert.equal(await title.inputValue(), '保留已有草稿标题');
    assert((await background.inputValue()).startsWith('原有项目背景\n\n【创作数据参考'));
    assert(await page.getByRole('button', { name: '已加入项目背景', exact: true }).isDisabled());
    await page.getByText('已记录：这条依据已加入选题草稿。', { exact: true }).waitFor();
    if (width === 1440) await page.screenshot({ path: '/tmp/xmt-creator-topic-adoption-1440.png', fullPage: false });
    assert.equal(topicWrites, 0, 'applying evidence never creates a topic');
    await page.getByRole('button', { name: width === 1440 ? '提报选题' : '提交选题', exact: true }).click();
    await page.getByText('服务器尚未找到这次创建请求', { exact: false }).waitFor();
    assert.equal(topicWrites, 1);
    assert.equal(await page.getByRole('button', { name: '确认用原内容和同一编号重试', exact: true }).count(), 1, 'explicit same-key retry appears only after the status endpoint confirms not_found');
    assert.equal(await title.isDisabled(), true, 'the exact original title remains locked during the retry decision');
    assert(String(lastTopic.description).includes('原有项目背景'));
    assert.deepEqual(lastTopic.creator_suggestion_source, {
      account_uid: data.account_uid,
      suggestion_id: data.items[0].id,
      evidence_id: data.items[0].evidence_id,
    }, 'the submitted topic carries only the selected account and exact current evidence fingerprint');
    assert.equal(await title.inputValue(), '保留已有草稿标题');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `overflow at ${width}`);
    await page.screenshot({ path: `/tmp/xmt-creator-topic-reference-${width}.png`, fullPage: true });
    if (width === 1440) {
      await page.goto(`${base}/analytics/creator-center`);
      await page.getByRole('heading', { name: '抖音数据驾驶舱', exact: true }).waitFor();
      delayedDashboardAccount = 'slow-account';
      delayDashboardMs = 500;
      const slowRequest = page.waitForRequest(request => request.url().includes('/api/creator-agent/douyin/dashboard?account_id=slow-account'));
      await page.evaluate(() => { history.pushState({}, '', '/analytics/creator-center?account_id=slow-account'); dispatchEvent(new PopStateEvent('popstate')); });
      await slowRequest;
      const fastResponse = page.waitForResponse(response => response.url().includes('/api/creator-agent/douyin/dashboard?account_id=fast-account'));
      await page.evaluate(() => { history.pushState({}, '', '/analytics/creator-center?account_id=fast-account'); dispatchEvent(new PopStateEvent('popstate')); });
      await fastResponse;
      await page.getByText('快速账号', { exact: true }).first().waitFor();
      await page.getByText('222', { exact: true }).first().waitFor();
      await page.waitForTimeout(600);
      const currentDashboardText = await page.locator('body').innerText();
      assert(currentDashboardText.includes('快速账号') && currentDashboardText.includes('222'), 'the latest account scope is displayed after fast response');
      assert(!currentDashboardText.includes('慢速账号') && !currentDashboardText.includes('111'), 'a slower response from the previous account cannot replace current dashboard data');

      const scopeRaceBefore = bindingCodeRequests;
      bindingCodeMode = 'delayed';
      bindingDelayByAccount.set('slow-account', 300);
      bindingDelayByAccount.set('fast-account', 1000);
      const slowDashboard = page.waitForResponse(response => response.url().includes('/api/creator-agent/douyin/dashboard?account_id=slow-account'));
      await page.evaluate(() => { history.pushState({}, '', '/analytics/creator-center?account_id=slow-account'); dispatchEvent(new PopStateEvent('popstate')); });
      await slowDashboard;
      const slowBindingCode = `ONE_TIME_${scopeRaceBefore + 1}`;
      const slowBindingResponse = page.waitForResponse(response => response.url().includes('/api/creator-agent/binding-codes')
        && response.request().method() === 'POST' && response.request().postDataJSON()?.account_id === 'slow-account');
      await page.getByRole('button', { name: '创建一次性绑定码', exact: true }).click();
      const fastDashboard = page.waitForResponse(response => response.url().includes('/api/creator-agent/douyin/dashboard?account_id=fast-account'));
      const slowBindingRequest = page.waitForRequest(request => request.url().includes('/api/creator-agent/binding-codes')
        && request.method() === 'POST' && request.postDataJSON()?.account_id === 'slow-account');
      await slowBindingRequest;
      await page.evaluate(() => { history.pushState({}, '', '/analytics/creator-center?account_id=fast-account'); dispatchEvent(new PopStateEvent('popstate')); });
      await fastDashboard;
      const fastBindingResponse = page.waitForResponse(response => response.url().includes('/api/creator-agent/binding-codes')
        && response.request().method() === 'POST' && response.request().postDataJSON()?.account_id === 'fast-account');
      await page.getByRole('button', { name: '创建一次性绑定码', exact: true }).click();
      await slowBindingResponse;
      assert.equal(await page.getByText(slowBindingCode, { exact: true }).count(), 0, 'a delayed code response is never shown for a different account');
      const pendingFastButton = page.getByRole('button', { name: '正在核实绑定码…', exact: true });
      await pendingFastButton.evaluate(button => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      await page.waitForTimeout(50);
      assert.equal(bindingCodeRequests, scopeRaceBefore + 2, 'an old account request completing cannot unlock and duplicate the current account operation');
      await fastBindingResponse;
      await page.getByText(`ONE_TIME_${scopeRaceBefore + 2}`, { exact: true }).waitFor();
      const scopedMarkers = await page.evaluate(() => Object.entries(window.sessionStorage)
        .filter(([key]) => key.startsWith('xmt.creator-agent.binding-recovery.v1:'))
        .map(([, value]) => JSON.parse(value) as { accountId: string }));
      assert(scopedMarkers.some(marker => marker.accountId === 'slow-account') && scopedMarkers.some(marker => marker.accountId === 'fast-account'), 'switching accounts preserves each actor/account recovery marker independently');
      const returnToSlow = page.waitForResponse(response => response.url().includes('/api/creator-agent/douyin/dashboard?account_id=slow-account'));
      await page.evaluate(() => { history.pushState({}, '', '/analytics/creator-center?account_id=slow-account'); dispatchEvent(new PopStateEvent('popstate')); });
      await returnToSlow;
      await page.getByText(slowBindingCode, { exact: true }).waitFor();
      assert.equal(bindingCodeRequests, scopeRaceBefore + 2, 'returning to the original account recovers its code without another create request');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await installDashboardCacheSpy(page);
  await page.goto(`${base}/__qa`);
  await page.getByRole('button', { name: '以此新建选题', exact: true }).waitFor();
  mode = 'failed';
  await page.getByRole('button', { name: '以此新建选题', exact: true }).click();
  await page.getByRole('button', { name: '重试创作依据' }).waitFor();
  const count = dashboardRequests;
  await page.getByPlaceholder('请输入选题标题').fill('失败不反复请求');
  assert.equal(dashboardRequests, count);
  mode = 'ready';
  await page.getByRole('button', { name: '重试创作依据' }).click();
  await page.getByRole('button', { name: '将依据加入项目背景', exact: true }).waitFor();
  assert.equal(dashboardRequests, count + 1);
  mode = 'ready'; feedbackOutcome = null; feedbackPostMode = 'not-committed';
  const adoptionPostsBeforeRetry = feedbackRequests;
  await page.getByRole('button', { name: '将依据加入项目背景', exact: true }).click();
  await page.getByText('采纳反馈已核实为尚未记录；依据仍保留在草稿中，确认后可安全重试反馈。', { exact: true }).waitFor();
  const backgroundInput = page.getByPlaceholder('请详细描述项目背景，包括选题的由来、市场背景、竞品分析、为什么要做这个选题等...');
  const appliedMarker = `【创作数据参考 ${data.account_uid}/${data.items[0].id}】`;
  assert((await backgroundInput.inputValue()).includes(appliedMarker), 'failed adoption feedback does not remove evidence already appended to the draft');
  assert.equal(feedbackRequests, adoptionPostsBeforeRetry + 1, 'the initial ambiguous adoption request is not automatically repeated');
  await page.getByRole('button', { name: '确认后重试采纳反馈', exact: true }).click();
  await page.getByText('已记录：这条依据已加入选题草稿。', { exact: true }).waitFor();
  assert.equal(feedbackRequests, adoptionPostsBeforeRetry + 2, 'the second adoption POST occurs only after the user explicitly retries');
  assert((await backgroundInput.inputValue()).includes(appliedMarker), 'explicit feedback retry keeps the already appended draft content');
  await page.goto(`${base}/analytics/creator-center`);
  await page.getByRole('heading', { name: '数据指导创作', exact: true }).waitFor();
  await page.getByRole('button', { name: '以此新建选题', exact: true }).click();
  const applyEvidence = page.getByRole('button', { name: '将依据加入项目背景', exact: true });
  await applyEvidence.waitFor();
  mode = 'feedback-delayed'; feedbackPostMode = 'committed-response-lost';
  const beforeAdoption = feedbackRequests;
  const dashboardBeforeAdoption = dashboardRequests;
  await applyEvidence.evaluate(button => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await page.getByText('已记录：这条依据已加入选题草稿。', { exact: true }).waitFor();
  assert.equal(feedbackRequests, beforeAdoption + 1, 'same suggestion adoption cannot submit twice while delayed');
  assert.equal(dashboardRequests, dashboardBeforeAdoption + 1, 'the AddTopic adoption flow recovers a committed response loss with one dashboard read');
  assert((await page.getByPlaceholder('请详细描述项目背景，包括选题的由来、市场背景、竞品分析、为什么要做这个选题等...').inputValue()).includes(appliedMarker), 'a lost adoption response does not remove evidence already appended to the draft');
  mode = 'ready';
  mode = 'empty'; await page.reload();
  await page.getByText('这条建议已不满足当前样本条件或不可用', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: '将依据加入项目背景', exact: true }).count(), 0);
  await page.goto(`${base}/analytics/creator-center`);
  await page.getByText('可比样本不足：', { exact: false }).waitFor();
  mode = 'no-create'; await page.reload();
  await page.getByText('需有提报选题权限才能使用新建入口。').waitFor();
  assert.equal(await page.getByRole('button', { name: '以此新建选题', exact: true }).count(), 0);
  mode = 'no-view';
  const beforeNoView = dashboardRequests;
  await page.goto(`${base}/topics/add?creatorAccount=${data.account_uid}&creatorSuggestion=${data.items[0].id}&creatorEvidence=${data.items[0].evidence_id}`);
  await page.getByText('当前账号无权读取创作依据', { exact: false }).waitFor();
  assert.equal(dashboardRequests, beforeNoView, 'topic creation alone cannot read analytics');
  assert.equal(await page.getByRole('button', { name: '将依据加入项目背景', exact: true }).count(), 0);
  mode = 'ready';
  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '抖音数据驾驶舱', exact: true }).waitFor();
    const agentStatus = page.getByText('采集端离线', { exact: true }).first();
    const colors = await agentStatus.evaluate(element => {
      const backgrounds: string[] = [];
      for (let current: Element | null = element; current; current = current.parentElement) {
        backgrounds.push(getComputedStyle(current).backgroundColor);
      }
      const root = getComputedStyle(document.documentElement);
      return { foreground: getComputedStyle(element).color, backgrounds, appBackground: root.getPropertyValue('--xmt-app-bg').trim() };
    });
    const foreground = colorChannels(colors.foreground)?.rgb;
    let background = colorChannels(colors.appBackground)?.rgb || [255, 255, 255];
    for (const layerValue of colors.backgrounds.reverse()) {
      const layer = colorChannels(layerValue);
      if (!layer || layer.alpha === 0) continue;
      background = layer.rgb.map((channel, index) => channel * layer.alpha + background[index] * (1 - layer.alpha));
    }
    const ratio = foreground ? contrastRatio(foreground, background) : 0;
    assert.ok(foreground && ratio >= 4.5, `${theme} Creator Center agent status contrast is ${ratio.toFixed(2)}:1; expected at least 4.5:1`);
  }
  const userDirectoryReadsBefore = userDirectoryReads;
  const topicWritesBeforeUserDirectoryRecovery = topicWrites;
  failNextUserDirectoryRead = true;
  await page.goto(`${base}/topics/add`);
  await page.getByPlaceholder('请输入选题标题').waitFor();
  await page.getByLabel('选题标题', { exact: true }).waitFor();
  await page.getByLabel('发布平台', { exact: true }).waitFor();
  await page.getByLabel('截止日期', { exact: true }).waitFor();
  await page.getByLabel('负责人', { exact: true }).waitFor();
  await page.getByLabel('项目背景', { exact: true }).waitFor();
  await page.getByLabel('目标受众', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: '选题大纲', exact: true }).waitFor();
  await page.getByRole('alert').filter({ hasText: '负责人名单暂时无法读取' }).waitFor();
  assert.equal(userDirectoryReads, userDirectoryReadsBefore + 1, 'the failed owner list is an independent read');
  await page.getByRole('button', { name: '重新加载负责人名单', exact: true }).click();
  await page.waitForFunction((name) => Array.from(document.querySelectorAll('select option')).some((option) => option.textContent?.trim() === name), user.name);
  assert.equal(await page.getByRole('alert').filter({ hasText: '负责人名单暂时无法读取' }).count(), 0, 'successful owner-list retry clears the warning');
  assert.equal(userDirectoryReads, userDirectoryReadsBefore + 2, 'owner-list retry performs one additional GET');
  assert.equal(topicWrites, topicWritesBeforeUserDirectoryRecovery, 'owner-list failure and recovery do not submit a topic');

  const mobileTopicContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const mobileTopicPage = await mobileTopicContext.newPage();
    await mobileTopicPage.goto(`${base}/__qa`);
    await mobileTopicPage.goto(`${base}/topics`);
    await mobileTopicPage.getByRole('button', { name: '新建选题', exact: true }).click();
    await mobileTopicPage.getByRole('heading', { name: '提报选题', level: 2, exact: true }).waitFor();
    await mobileTopicPage.waitForFunction(() => document.activeElement?.matches('[data-mobile-page-heading]'));
    assert.equal(await mobileTopicPage.getByRole('heading', { level: 1 }).count(), 1, 'mobile topic creation retains a single shell-level heading');
    assert.equal(await mobileTopicPage.getByRole('heading', { name: '选题', level: 1, exact: true }).count(), 1, 'mobile shell exposes the selected section as the only H1');
    assert.equal(await mobileTopicPage.getByRole('heading', { name: '提报选题', level: 2, exact: true }).count(), 1, 'the specific page title remains a level-two heading');
    const mobileTopicTitle = mobileTopicPage.getByLabel('选题标题', { exact: true });
    await mobileTopicTitle.waitFor();
    assert.equal(await mobileTopicTitle.getAttribute('id'), 'mobile-topic-title', 'mobile topic title has a stable id');
    assert.equal(await mobileTopicTitle.getAttribute('name'), 'title', 'mobile topic title has a stable field name');
    assert.equal(await mobileTopicTitle.getAttribute('required'), '', 'mobile topic title exposes its required state');
    await mobileTopicPage.getByLabel('发布平台', { exact: true }).waitFor();
    await mobileTopicPage.getByLabel('截止日期', { exact: true }).waitFor();
    await mobileTopicPage.getByLabel('项目背景', { exact: true }).waitFor();
    await mobileTopicPage.getByLabel('目标受众', { exact: true }).waitFor();
    await mobileTopicPage.getByLabel('大纲结构', { exact: true }).waitFor();
    const topicWritesBeforeEmptyMobileSubmit = topicWrites;
    await mobileTopicPage.getByRole('button', { name: '提交选题', exact: true }).click();
    await mobileTopicPage.getByRole('status').filter({ hasText: '请输入选题标题' }).waitFor();
    assert.equal(topicWrites, topicWritesBeforeEmptyMobileSubmit, 'empty mobile topic submission shows guidance without sending a create request');
    assert.equal(await mobileTopicPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'mobile topic form has no horizontal overflow at 390px');
  } finally {
    await mobileTopicContext.close();
  }

  mode = 'ready'; feedbackOutcome = null; feedbackPostMode = 'ready'; feedbackReadbackOverride = 'normal';
  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '数据指导创作', exact: true }).waitFor();
  const recoveryNotAdopted = page.getByRole('button', { name: '暂不采用', exact: true });
  const postsBeforeUnreadableRecovery = feedbackRequests;
  const dashboardBeforeUnreadableRecovery = dashboardRequests;
  feedbackPostMode = 'not-committed'; feedbackReadFailures = 1;
  await recoveryNotAdopted.click();
  await page.getByText('反馈结果暂未确认，状态读取失败；只读重新核实前不会再次提交。', { exact: true }).waitFor();
  assert.equal(feedbackRequests, postsBeforeUnreadableRecovery + 1, 'a failed readback does not automatically repeat the feedback POST');
  assert.equal(dashboardRequests, dashboardBeforeUnreadableRecovery + 1, 'a failed POST is followed by one read-only dashboard verification');
  await page.getByRole('button', { name: '只读重新核实反馈状态', exact: true }).click();
  await page.getByText('只读核实确认暂不采用反馈尚未记录；确认后可安全重试。', { exact: true }).waitFor();
  assert.equal(feedbackRequests, postsBeforeUnreadableRecovery + 1, 'manual re-verification remains GET-only');
  assert.equal(dashboardRequests, dashboardBeforeUnreadableRecovery + 2, 'manual re-verification makes one additional dashboard GET');
  const recoveryCacheModes = await page.evaluate(() => (window as Window & { __xmtDashboardFetchCaches?: Array<RequestCache | undefined> }).__xmtDashboardFetchCaches || []);
  assert.equal(recoveryCacheModes.at(-1), 'no-store', 'manual feedback re-verification bypasses the browser HTTP cache');
  await page.getByRole('button', { name: '确认后重试暂不采用', exact: true }).click();
  await page.getByText('你已标记为暂不采用', { exact: true }).waitFor();
  assert.equal(feedbackRequests, postsBeforeUnreadableRecovery + 2, 'a confirmed-missing feedback is written only after explicit retry');

  feedbackOutcome = null; feedbackPostMode = 'ready'; feedbackReadbackOverride = 'normal';
  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '数据指导创作', exact: true }).waitFor();
  const staleEvidenceButton = page.getByRole('button', { name: '暂不采用', exact: true });
  const postsBeforeStaleEvidence = feedbackRequests;
  feedbackReadbackOverride = 'stale-evidence'; feedbackPostMode = 'committed-response-lost';
  await staleEvidenceButton.click();
  await page.getByText('创作建议样本或反馈状态已变化，未再次提交。请刷新数据后核实。', { exact: true }).waitFor();
  assert.equal(feedbackRequests, postsBeforeStaleEvidence + 1, 'stale evidence recovery never replays the feedback POST');
  assert.equal(await page.getByRole('button', { name: '确认后重试暂不采用', exact: true }).count(), 0, 'stale evidence does not expose a retry action');

  feedbackOutcome = null; feedbackReadbackOverride = 'normal'; feedbackPostMode = 'ready';
  await page.goto(`${base}/__qa`);
  await page.getByRole('heading', { name: '数据指导创作', exact: true }).waitFor();
  const changedOutcomeButton = page.getByRole('button', { name: '暂不采用', exact: true });
  const postsBeforeChangedOutcome = feedbackRequests;
  feedbackReadbackOverride = 'other-outcome'; feedbackPostMode = 'not-committed';
  await changedOutcomeButton.click();
  await page.getByText('创作建议样本或反馈状态已变化，未再次提交。请刷新数据后核实。', { exact: true }).waitFor();
  assert.equal(feedbackRequests, postsBeforeChangedOutcome + 1, 'another stored outcome blocks retry and leaves the write count unchanged');
  assert.equal(await page.getByRole('button', { name: '确认后重试暂不采用', exact: true }).count(), 0, 'another outcome does not expose a retry action');
  await context.close();
  console.log('Creator topic suggestions browser passed: evidence → authorized handoff → draft-preserving apply/adoption feedback, explicit non-adoption feedback and retry; failed submit recovery, stale evidence, sample gates and permissions; 1440/390/320px; AddTopic owner-list 503 and read-only retry.');
} finally {
  await browser.close(); await vite.close(); await new Promise<void>(resolve => io.close(() => resolve()));
}
