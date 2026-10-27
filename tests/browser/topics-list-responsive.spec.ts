import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';
import { topicStatusLabel } from '../../src/components/topics/topicStatusLabel';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
assert.deepEqual(
  ['pending', 'approved', 'rejected', 'production', 'shooting', 'publishing', 'completed'].map(topicStatusLabel),
  ['待审核', '已通过', '已驳回', '创作中', '成片制作', '发布中', '已完成'],
  'known topic status codes should use consistent business labels',
);
assert.equal(topicStatusLabel('future_status'), '状态待确认', 'unknown topic status codes should not leak into the UI');
assert.equal(topicStatusLabel(undefined), '状态待确认', 'missing topic status should use a neutral label');
const user = { id: 95, username: 'topics-list-qa', role: 'admin', name: '选题列表验收', enabled: true, force_change_password: false };
const topic = {
  id: 951,
  title: '响应式操作列验收选题',
  description: '只读浏览器夹具，不写入业务数据库。',
  outline: '',
  status: 'production',
  platform: '抖音',
  creator_id: user.id,
  creator_name: user.name,
  assignee_id: user.id,
  assignee_name: user.name,
  submitted_at: '2026-10-07 09:00:00',
  created_at: '2026-10-07 09:00:00',
  deadline: '2026-10-20',
  history: [{ id: 1, action: 'created', comment: '移动端验收协作备注', operator_name: user.name, created_at: '2026-10-07 09:00:00' }],
};
const boardAuditTopic = {
  ...topic,
  id: 952,
  title: '看板审核重复提交验收选题',
  description: '隔离看板审核互斥验收。',
  status: 'pending' as string,
};
const mobileAdvanceTopic = {
  ...boardAuditTopic,
  id: 953,
  title: '移动端阶段结果核实选题',
  status: 'shooting' as string,
  stage_record_presence: { production: true, shooting: true, publishing: false },
};
const topicFilterFixtureTopics = Array.from({ length: 23 }, (_, index) => ({
  ...topic,
  id: 1000 + index,
  title: `筛选分页验收选题 ${index + 1}`,
  description: '仅用于移动端筛选与服务端分页隔离验收。',
  status: ['approved', 'production', 'shooting', 'publishing', 'pending', 'rejected', 'completed'][index % 7],
  creator_id: index < 21 && index % 2 === 0 ? user.id : 96,
  assignee_id: index < 21 && index % 2 === 1 ? user.id : null,
}));
let topicExists = true;
let topicFilterFixtureEnabled = false;
let topicListGetRequests = 0;
let failNextTopicListRead = false;
let delayNextTopicListRead = false;
let topicListReadStarted = false;
let releaseTopicListRead: (() => void) | null = null;
let failNextTopicDelete = false;
let commitNextTopicDeleteThenFail = false;
let failNextTopicDetailRead = false;
let topicDetailReadCount = 0;
let topicDeleteRequestCount = 0;
let delayNextTopicDelete = false;
let topicDeleteStarted = false;
let topicDeleteGate: Promise<void> = Promise.resolve();
let releaseTopicDelete: (() => void) | null = null;
let holdNextBoardAudit = false;
let boardAuditStartedCallback: (() => void) | null = null;
let releaseBoardAudit: (() => void) | null = null;
let boardAuditAttempts = 0;
let boardAuditWrites = 0;
let failNextBoardAuditBeforeCommit = false;
let commitNextBoardAuditThenFail = false;
let failNextBatchAuditBeforeCommit = false;
let commitNextBatchAuditThenFail = false;
let batchAuditAttempts = 0;
let batchAuditWrites = 0;
let failNextBoardStatusBeforeCommit = false;
let commitNextBoardStatusThenFail = false;
let boardStatusAttempts = 0;
let boardStatusWrites = 0;

function luminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

async function textContrast(locator: import('playwright').Locator) {
  return locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    const row = element.closest('tr');
    const background = (row ? getComputedStyle(row).backgroundColor : getComputedStyle(document.body).backgroundColor).match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    return { foreground, background, rowBackground: row ? getComputedStyle(row).backgroundColor : '' };
  }).then(({ foreground, background, rowBackground }) => {
    if (foreground.length !== 3 || background.length !== 3) return { ratio: 0, rowBackground };
    const textLuminance = foreground.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
    const backgroundLuminance = background.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
    return { ratio: (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05), rowBackground };
  });
}

async function elementBackgroundContrast(locator: import('playwright').Locator) {
  const { foreground, background } = await locator.evaluate((element) => ({
    foreground: getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [],
    background: getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [],
  }));
  if (foreground.length !== 3 || background.length !== 3) return 0;
  const textLuminance = foreground.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
  const backgroundLuminance = background.reduce((sum, channel, index) => sum + [0.2126, 0.7152, 0.0722][index] * luminance(channel), 0);
  return (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
}

function hasVisibleAlpha(color: string) {
  if (color === 'transparent') return false;
  const slashAlpha = color.match(/\/\s*([\d.]+)\s*\)$/)?.[1];
  if (slashAlpha !== undefined) return Number(slashAlpha) > 0;
  const rgbaAlpha = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/i)?.[1];
  return rgbaAlpha === undefined || Number(rgbaAlpha) > 0;
}

async function contrastRatio(locator: import('playwright').Locator) {
  return locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current && current !== document.documentElement; current = current.parentElement) ancestors.push(current);
    ancestors.reverse();
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const foreground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    const background = [255, 255, 255];
    const backgroundColors = [getComputedStyle(document.documentElement).backgroundColor];
    for (const ancestor of ancestors) backgroundColors.push(getComputedStyle(ancestor).backgroundColor);
    for (const color of backgroundColors) {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const layer = Array.from(context.getImageData(0, 0, 1, 1).data);
      const alpha = layer[3] / 255;
      for (let index = 0; index < 3; index += 1) background[index] = layer[index] * alpha + background[index] * (1 - alpha);
    }
    let textLuminance = 0;
    let backgroundLuminance = 0;
    const weights = [0.2126, 0.7152, 0.0722];
    for (let index = 0; index < 3; index += 1) {
      const textValue = foreground[index] / 255;
      const backgroundValue = background[index] / 255;
      const linearText = textValue <= 0.04045 ? textValue / 12.92 : ((textValue + 0.055) / 1.055) ** 2.4;
      const linearBackground = backgroundValue <= 0.04045 ? backgroundValue / 12.92 : ((backgroundValue + 0.055) / 1.055) ** 2.4;
      textLuminance += weights[index] * linearText;
      backgroundLuminance += weights[index] * linearBackground;
    }
    return (Math.max(textLuminance, backgroundLuminance) + 0.05) / (Math.min(textLuminance, backgroundLuminance) + 0.05);
  });
}

async function assertTopicsBoardContrast(page: import('playwright').Page, theme: string) {
  const pendingColumn = page.locator('[aria-labelledby="topic-column-pending"]');
  const pendingCard = page.locator('article').filter({ hasText: boardAuditTopic.title });
  await pendingCard.waitFor();
  const items = [
    ['筛选结果计数', page.getByText(/^显示 \d+ \/ \d+ 个选题$/)],
    ['看板列计数', pendingColumn.locator('header span.rounded-full')],
    ['选题负责人', pendingCard.getByText(topic.assignee_name, { exact: true })],
    ['截止日期', pendingCard.locator('time')],
    ['空列提示', page.getByText('暂无选题', { exact: true }).first()],
  ] as const;
  for (const [label, locator] of items) {
    await locator.waitFor({ state: 'visible' });
    const ratio = await contrastRatio(locator);
    assert(ratio >= 4.5, `${theme} topic board ${label} text contrast is ${ratio.toFixed(2)}:1`);
  }
  await page.getByRole('status', { name: /^显示 \d+ \/ \d+ 个选题$/ }).waitFor({ state: 'visible' });

  const statusPills = page.locator('article span.inline-flex[class*="border-studio-"]');
  const statusPillCount = await statusPills.count();
  assert.ok(statusPillCount > 0, `${theme} topic board renders status badges`);
  for (let index = 0; index < statusPillCount; index += 1) {
    const pill = statusPills.nth(index);
    const backgroundColor = await pill.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(backgroundColor, 'rgba(0, 0, 0, 0)', `${theme} topic board status badge ${index + 1} has a rendered theme background`);
    const ratio = await contrastRatio(pill);
    assert(ratio >= 4.5, `${theme} topic board status badge ${index + 1} text contrast is ${ratio.toFixed(2)}:1`);
  }
}

async function assertMainButtonTouchTargets(page: import('playwright').Page, surface: string) {
  const buttons = await page.locator('main button').evaluateAll((elements) => elements.flatMap((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden') return [];
    return [{
      name: element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('title') || '(未命名)',
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }];
  }));
  assert.ok(buttons.length > 0, `${surface} exposes measurable main controls`);
  const undersized = buttons.filter((button) => button.width < 40 || button.height < 40);
  assert.deepEqual(undersized, [], `${surface} main controls meet the 40px minimum: ${JSON.stringify(undersized)}`);
}

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  topicFilterFixtureEnabled = req.query.filter_fixture === 'true';
  if (req.query.fail_list_get === 'true') {
    topicListGetRequests = 0;
    failNextTopicListRead = true;
  }
  if (req.query.delay_list_get === 'true') {
    topicListGetRequests = 0;
    delayNextTopicListRead = true;
    topicListReadStarted = false;
  }
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','topics-list-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(req.query.theme === 'dark' ? 'dark' : 'light')});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/topics');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/topics', async (req, res) => {
  topicListGetRequests += 1;
  if (delayNextTopicListRead) {
    delayNextTopicListRead = false;
    topicListReadStarted = true;
    await new Promise<void>((resolve) => { releaseTopicListRead = resolve; });
    releaseTopicListRead = null;
  }
  if (failNextTopicListRead) {
    failNextTopicListRead = false;
    return res.status(503).json({ message: '模拟选题列表读取失败' });
  }
  if (topicFilterFixtureEnabled) {
    const status = String(req.query.status || '');
    const topicFilter = String(req.query.topic_filter || '');
    const search = String(req.query.search || '').trim().toLocaleLowerCase();
    let filtered = topicFilterFixtureTopics.filter((item) => {
      if (status === 'creation') return item.status === 'approved' || item.status === 'production';
      if (status && item.status !== status) return false;
      if (topicFilter === 'mine' && item.creator_id !== user.id && item.assignee_id !== user.id) return false;
      if (topicFilter === 'active' && !['approved', 'production', 'shooting', 'publishing'].includes(item.status)) return false;
      if (search && !`${item.title} ${item.description}`.toLocaleLowerCase().includes(search)) return false;
      return true;
    });
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 15;
    const total = filtered.length;
    filtered = filtered.slice((page - 1) * limit, page * limit);
    return res.json({ data: filtered, total, page, limit });
  }
  const isBoardRequest = Number(req.query.limit) >= 200;
  const data = topicExists ? (isBoardRequest ? [topic, boardAuditTopic] : [topic]) : [];
  return res.json({ data, total: topicExists ? 31 : 30, page: 1, limit: Number(req.query.limit) || 15 });
});
app.get('/__qa/topic-list-state', (_req, res) => res.json({ topicListGetRequests, topicListReadStarted }));
app.post('/__qa/release-topic-list-read', (_req, res) => {
  releaseTopicListRead?.();
  releaseTopicListRead = null;
  return res.json({ released: true });
});
app.get('/api/topics/:id/resources', (_req, res) => res.json({ data: [] }));
app.get('/api/topics/:id/asset-dimensions', (_req, res) => res.json({ data: [] }));
app.get('/api/topics/:id', (req, res) => {
  topicDetailReadCount += 1;
  if (failNextTopicDetailRead) {
    failNextTopicDetailRead = false;
    return res.status(503).json({ message: '模拟详情读取失败' });
  }
  if (Number(req.params.id) === boardAuditTopic.id) return res.json({ data: boardAuditTopic });
  if (Number(req.params.id) === mobileAdvanceTopic.id) return res.json({ data: mobileAdvanceTopic });
  if (Number(req.params.id) !== topic.id || !topicExists) return res.status(404).json({ message: '选题不存在' });
  return res.json({ data: topic });
});
app.get('/__qa/topic-detail-state', (_req, res) => res.json({ topicDetailReadCount }));
app.post('/__qa/restore-topic', (_req, res) => {
  topicExists = true;
  return res.json({ restored: true });
});
app.post('/__qa/reset-batch-audit', (_req, res) => {
  topic.status = 'pending';
  failNextBatchAuditBeforeCommit = false;
  commitNextBatchAuditThenFail = false;
  return res.json({ status: topic.status });
});
app.post('/__qa/commit-next-batch-audit-then-fail', (_req, res) => {
  topic.status = 'pending';
  commitNextBatchAuditThenFail = true;
  return res.json({ armed: true });
});
app.post('/__qa/fail-next-batch-audit-and-read', (_req, res) => {
  topic.status = 'pending';
  failNextBatchAuditBeforeCommit = true;
  failNextTopicDetailRead = true;
  return res.json({ armed: true });
});
app.get('/__qa/batch-audit-state', (_req, res) => res.json({ status: topic.status, batchAuditAttempts, batchAuditWrites }));
app.post('/__qa/reset-board-audit', (_req, res) => {
  boardAuditTopic.status = 'pending';
  failNextBoardAuditBeforeCommit = false;
  commitNextBoardAuditThenFail = false;
  return res.json({ status: boardAuditTopic.status });
});
app.post('/__qa/commit-next-board-audit-then-fail', (_req, res) => {
  boardAuditTopic.status = 'pending';
  commitNextBoardAuditThenFail = true;
  return res.json({ armed: true });
});
app.post('/__qa/fail-next-board-audit-and-read', (_req, res) => {
  boardAuditTopic.status = 'pending';
  failNextBoardAuditBeforeCommit = true;
  failNextTopicDetailRead = true;
  return res.json({ armed: true });
});
app.get('/__qa/board-audit-state', (_req, res) => res.json({ status: boardAuditTopic.status, boardAuditAttempts, boardAuditWrites }));
app.post('/__qa/reset-board-status', (_req, res) => {
  mobileAdvanceTopic.status = 'shooting';
  mobileAdvanceTopic.stage_record_presence = { production: true, shooting: true, publishing: false };
  failNextBoardStatusBeforeCommit = false;
  commitNextBoardStatusThenFail = false;
  return res.json({ status: mobileAdvanceTopic.status });
});
app.post('/__qa/commit-next-board-status-then-fail', (_req, res) => {
  mobileAdvanceTopic.status = 'shooting';
  commitNextBoardStatusThenFail = true;
  return res.json({ armed: true });
});
app.post('/__qa/fail-next-board-status-and-read', (_req, res) => {
  mobileAdvanceTopic.status = 'shooting';
  failNextBoardStatusBeforeCommit = true;
  failNextTopicDetailRead = true;
  return res.json({ armed: true });
});
app.get('/__qa/board-status-state', (_req, res) => res.json({ status: mobileAdvanceTopic.status, boardStatusAttempts, boardStatusWrites }));
app.post('/__qa/fail-next-topic-delete', (_req, res) => {
  failNextTopicDelete = true;
  return res.json({ armed: true });
});
app.post('/__qa/commit-next-topic-delete-then-fail', (_req, res) => {
  commitNextTopicDeleteThenFail = true;
  return res.json({ armed: true });
});
app.post('/__qa/fail-next-topic-detail-read', (_req, res) => {
  failNextTopicDetailRead = true;
  return res.json({ armed: true });
});
app.post('/__qa/delay-next-topic-delete', (_req, res) => {
  delayNextTopicDelete = true;
  topicDeleteStarted = false;
  topicDeleteGate = new Promise<void>((resolve) => { releaseTopicDelete = resolve; });
  return res.json({ delayed: true });
});
app.get('/__qa/topic-delete-state', (_req, res) => res.json({ topicDeleteRequestCount, topicDeleteStarted }));
app.post('/__qa/release-topic-delete', (_req, res) => {
  releaseTopicDelete?.();
  releaseTopicDelete = null;
  return res.json({ released: true });
});
app.post('/api/topics/:id/audit', async (req, res) => {
  if (Number(req.params.id) === boardAuditTopic.id) {
    boardAuditAttempts += 1;
    if (failNextBoardAuditBeforeCommit) {
      failNextBoardAuditBeforeCommit = false;
      return res.status(503).json({ message: '模拟看板审核请求未写入' });
    }
    if (holdNextBoardAudit) {
      holdNextBoardAudit = false;
      boardAuditStartedCallback?.();
      boardAuditStartedCallback = null;
      await new Promise<void>((resolve) => { releaseBoardAudit = resolve; });
      releaseBoardAudit = null;
    }
    boardAuditWrites += 1;
    boardAuditTopic.status = String(req.body?.status);
    if (commitNextBoardAuditThenFail) {
      commitNextBoardAuditThenFail = false;
      return res.status(503).json({ message: '模拟看板审核已写入但响应丢失' });
    }
    return res.json({ message: '审核结果已保存' });
  }
  if (Number(req.params.id) === topic.id) {
    batchAuditAttempts += 1;
    if (failNextBatchAuditBeforeCommit) {
      failNextBatchAuditBeforeCommit = false;
      return res.status(503).json({ message: '模拟审核请求未写入' });
    }
    topic.status = String(req.body?.status);
    batchAuditWrites += 1;
    if (commitNextBatchAuditThenFail) {
      commitNextBatchAuditThenFail = false;
      return res.status(503).json({ message: '模拟服务端已审核但响应丢失' });
    }
    return res.json({ message: '审核结果已保存' });
  }
  return res.status(404).json({ message: '选题不存在' });
});
app.post('/api/topics/:id/status', (req, res) => {
  if (Number(req.params.id) !== mobileAdvanceTopic.id) return res.status(404).json({ message: '选题不存在' });
  boardStatusAttempts += 1;
  if (failNextBoardStatusBeforeCommit) {
    failNextBoardStatusBeforeCommit = false;
    return res.status(503).json({ message: '模拟移动端状态更新请求未写入' });
  }
  mobileAdvanceTopic.status = String(req.body?.status);
  if (mobileAdvanceTopic.status === 'publishing') mobileAdvanceTopic.stage_record_presence.publishing = true;
  boardStatusWrites += 1;
  if (commitNextBoardStatusThenFail) {
    commitNextBoardStatusThenFail = false;
    return res.status(503).json({ message: '模拟移动端状态已更新但响应丢失' });
  }
  return res.json({ message: '状态已更新' });
});
app.delete('/api/topics/:id', async (_req, res) => {
  topicDeleteRequestCount += 1;
  if (delayNextTopicDelete) {
    delayNextTopicDelete = false;
    topicDeleteStarted = true;
    const currentGate = topicDeleteGate;
    await currentGate;
  }
  if (failNextTopicDelete) {
    failNextTopicDelete = false;
    return res.status(503).json({ message: '模拟删除失败' });
  }
  topicExists = false;
  if (commitNextTopicDeleteThenFail) {
    commitNextTopicDeleteThenFail = false;
    return res.status(503).json({ message: '模拟服务端已提交但响应丢失' });
  }
  return res.json({ message: '选题已删除' });
});
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_TOPICS_RESPONSIVE_QA_SERVE === '1') {
  console.log(`Isolated Topics responsive QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)') || message.text().includes('404 (Not Found)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  const mobileListLoadingPage = await context.newPage();
  await mobileListLoadingPage.setViewportSize({ width: 390, height: 844 });
  mobileListLoadingPage.setDefaultTimeout(5000);
  mobileListLoadingPage.on('pageerror', (error) => errors.push(error.message));
  mobileListLoadingPage.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const initialTopicListMethods: string[] = [];
  mobileListLoadingPage.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/topics') initialTopicListMethods.push(request.method());
  });
  try {
    await mobileListLoadingPage.goto(`${base}/__qa?delay_list_get=true`);
    await mobileListLoadingPage.getByRole('status').filter({ hasText: '正在加载选题…' }).waitFor();
    await mobileListLoadingPage.getByText('正在读取选题数量…', { exact: true }).waitFor();
    assert.equal(await mobileListLoadingPage.getByText('0 个选题', { exact: true }).count(), 0, 'initial mobile loading does not show a zero-result count before the read succeeds');
    assert.equal(await mobileListLoadingPage.getByRole('button', { name: '正在加载…', exact: true }).isDisabled(), true, 'the initial loading action is clearly labeled and disabled');
    const delayedListState = await mobileListLoadingPage.request.get(`${base}/__qa/topic-list-state`).then((response) => response.json());
    assert.equal(delayedListState.topicListGetRequests, 1, 'the delayed initial list state uses one read');
    assert.equal(delayedListState.topicListReadStarted, true, 'the loading labels are checked while the list request is still pending');
    await mobileListLoadingPage.request.post(`${base}/__qa/release-topic-list-read`);
    await mobileListLoadingPage.getByRole('heading', { name: topic.title, exact: true }).waitFor();
    await mobileListLoadingPage.getByText('31 个选题', { exact: true }).waitFor();
    assert.deepEqual(initialTopicListMethods, ['GET'], 'initial mobile loading performs a read only');
  } finally {
    await mobileListLoadingPage.request.post(`${base}/__qa/release-topic-list-read`).catch(() => undefined);
    await mobileListLoadingPage.close();
  }

  const listReadFailurePage = await context.newPage();
  listReadFailurePage.setDefaultTimeout(5000);
  listReadFailurePage.on('pageerror', (error) => errors.push(error.message));
  listReadFailurePage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  const topicListMethods: string[] = [];
  listReadFailurePage.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/topics') topicListMethods.push(request.method());
  });
  await listReadFailurePage.goto(`${base}/__qa?fail_list_get=true`);
  await listReadFailurePage.getByRole('heading', { name: '选题管理' }).waitFor();
  const listFailureNotification = listReadFailurePage.getByRole('status').getByText('获取选题列表失败', { exact: true });
  await listFailureNotification.waitFor();
  await listReadFailurePage.getByText('模拟选题列表读取失败', { exact: true }).waitFor();
  await listReadFailurePage.getByRole('button', { name: '重试', exact: true }).waitFor();
  const initialListFailureState = await listReadFailurePage.request.get(`${base}/__qa/topic-list-state`).then((response) => response.json());
  assert.equal(initialListFailureState.topicListGetRequests, 1, 'the failed desktop list read does not repeat before an explicit retry');
  assert.equal(await listFailureNotification.count(), 1, 'an initial list failure presents one understandable error notification');
  assert.equal(await listReadFailurePage.getByText('暂无选题', { exact: true }).count(), 0, 'a failed list read is not misreported as an empty result');
  await listReadFailurePage.screenshot({ path: '/tmp/xmt-topics-list-failure-single-toast.png', fullPage: false });
  const retryListRead = listReadFailurePage.waitForResponse((response) => new URL(response.url()).pathname === '/api/topics' && response.status() === 200);
  await listReadFailurePage.getByRole('button', { name: '重试', exact: true }).click();
  await retryListRead;
  await listReadFailurePage.getByRole('table').getByText('创作中', { exact: true }).waitFor();
  const recoveredListState = await listReadFailurePage.request.get(`${base}/__qa/topic-list-state`).then((response) => response.json());
  assert.equal(recoveredListState.topicListGetRequests, 2, 'an explicit retry adds exactly one list read');
  assert.deepEqual(topicListMethods, ['GET', 'GET'], 'initial read and retry are both read-only');
  assert.deepEqual(errors, [], 'topic list failure and recovery render without unexpected browser errors');
  assert.equal(expectedHttpErrors.length, 1, 'only the deliberately injected initial 503 is expected');
  await listReadFailurePage.screenshot({ path: '/tmp/xmt-topics-list-failure-recovered.png', fullPage: false });
  await listReadFailurePage.close();

  const mobileListFailurePage = await context.newPage();
  await mobileListFailurePage.setViewportSize({ width: 390, height: 844 });
  mobileListFailurePage.setDefaultTimeout(5000);
  mobileListFailurePage.on('pageerror', (error) => errors.push(error.message));
  mobileListFailurePage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  const mobileTopicListMethods: string[] = [];
  mobileListFailurePage.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/topics') mobileTopicListMethods.push(request.method());
  });
  await mobileListFailurePage.goto(`${base}/__qa?fail_list_get=true`);
  await mobileListFailurePage.getByRole('alert').getByText('选题列表读取失败：模拟选题列表读取失败', { exact: true }).waitFor();
  await mobileListFailurePage.waitForTimeout(1250);
  const mobileInitialListFailureState = await mobileListFailurePage.request.get(`${base}/__qa/topic-list-state`).then((response) => response.json());
  assert.equal(mobileInitialListFailureState.topicListGetRequests, 1, 'a mobile topic-list failure does not trigger a hidden React Query retry');
  assert.equal(await mobileListFailurePage.getByRole('alert').count(), 1, 'mobile list failure presents one inline error');
  assert.equal(await mobileListFailurePage.getByText('没有符合条件的选题', { exact: true }).count(), 0, 'a failed mobile list read is not misreported as an empty result');
  await mobileListFailurePage.screenshot({ path: '/tmp/xmt-mobile-topics-list-failure.png', fullPage: false });
  const mobileRetryListRead = mobileListFailurePage.waitForResponse((response) => new URL(response.url()).pathname === '/api/topics' && response.status() === 200);
  await mobileListFailurePage.getByRole('button', { name: '重试加载选题', exact: true }).click();
  await mobileRetryListRead;
  await mobileListFailurePage.getByRole('heading', { name: topic.title, exact: true }).waitFor();
  const mobileRecoveredListState = await mobileListFailurePage.request.get(`${base}/__qa/topic-list-state`).then((response) => response.json());
  assert.equal(mobileRecoveredListState.topicListGetRequests, 2, 'an explicit mobile retry adds exactly one list read');
  assert.deepEqual(mobileTopicListMethods, ['GET', 'GET'], 'mobile failure and recovery remain read-only');
  assert.deepEqual(errors, [], 'desktop and mobile list loading/failure recovery render without unexpected browser errors');
  assert.equal(expectedHttpErrors.length, 2, 'only the deliberately injected desktop and mobile 503s are expected');
  await mobileListFailurePage.screenshot({ path: '/tmp/xmt-mobile-topics-list-recovered.png', fullPage: false });
  await mobileListFailurePage.close();

  await page.goto(`${base}/__qa`);
  await page.getByRole('table').getByText('创作中', { exact: true }).waitFor();
  await page.getByRole('heading', { name: '选题管理' }).waitFor();
  await page.getByRole('textbox', { name: '搜索选题标题或描述' }).waitFor();
  await assertMainButtonTouchTargets(page, 'desktop topic list');
  assert.equal(await page.getByRole('textbox', { name: '搜索选题标题或描述' }).getAttribute('id'), 'topics-search');
  assert.equal(await page.getByRole('textbox', { name: '搜索选题标题或描述' }).getAttribute('name'), 'topicsSearch');

  const detailReadCountBefore = (await page.request.get(`${base}/__qa/topic-detail-state`).then((response) => response.json())).topicDetailReadCount;
  const topicDetailMethods: string[] = [];
  const topicDetailRequestListener = (request: import('playwright').Request) => {
    if (/^\/api\/topics\/\d+$/.test(new URL(request.url()).pathname)) topicDetailMethods.push(request.method());
  };
  page.on('request', topicDetailRequestListener);
  await page.request.post(`${base}/__qa/fail-next-topic-detail-read`);
  await page.goto(`${base}/topics/${topic.id}`);
  await page.getByRole('alert').getByText('选题详情暂时无法读取', { exact: true }).waitFor();
  assert.equal(await page.getByText('选题不存在或已不可见', { exact: true }).count(), 0, 'a temporary detail-read failure is not presented as a missing topic');
  assert.equal(await page.getByText('模拟详情读取失败', { exact: true }).count(), 0, 'the fixture response body is not exposed in the user-facing failure');
  assert.equal((await page.request.get(`${base}/__qa/topic-detail-state`).then((response) => response.json())).topicDetailReadCount, detailReadCountBefore + 1, 'the initial failed state uses one read');
  await page.getByRole('button', { name: '重新加载选题详情', exact: true }).click();
  await page.getByRole('heading', { name: topic.title, exact: true }).waitFor();
  assert.equal((await page.request.get(`${base}/__qa/topic-detail-state`).then((response) => response.json())).topicDetailReadCount, detailReadCountBefore + 2, 'retry performs one additional read and recovers the topic');
  assert.deepEqual(topicDetailMethods, ['GET', 'GET'], 'detail failure recovery performs no topic mutation');
  page.off('request', topicDetailRequestListener);
  await page.goto(`${base}/topics/999999`);
  await page.getByRole('status').getByText('选题不存在或已不可见', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '重新加载选题详情', exact: true }).count(), 0, 'a confirmed 404 is kept distinct from a retryable read failure');
  await page.request.post(`${base}/__qa/fail-next-topic-detail-read`);
  await page.evaluate((nextId) => {
    const previousState = window.history.state ?? {};
    const nextIndex = Number.isInteger(previousState.idx) ? previousState.idx + 1 : 1;
    window.history.pushState({ ...previousState, usr: null, key: `qa-topic-${nextId}`, idx: nextIndex }, '', `/topics/${nextId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, topic.id + 1);
  await page.getByRole('alert').getByText('选题详情暂时无法读取', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: topic.title, exact: true }).count(), 0, 'a same-page route change never leaves the previous topic visible after the new read fails');
  assert.equal(topicDetailMethods[topicDetailMethods.length - 1], 'GET', 'same-page route recovery remains read-only');

  const mobileDetailPage = await browser.newPage({ viewport: { width: 320, height: 812 }, reducedMotion: 'reduce' });
  mobileDetailPage.setDefaultTimeout(5000);
  mobileDetailPage.on('pageerror', (error) => errors.push(error.message));
  mobileDetailPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)') || message.text().includes('404 (Not Found)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  await mobileDetailPage.goto(`${base}/__qa?theme=dark`);
  const mobileDetailReadCountBefore = (await mobileDetailPage.request.get(`${base}/__qa/topic-detail-state`).then((response) => response.json())).topicDetailReadCount;
  const mobileTopicDetailMethods: string[] = [];
  mobileDetailPage.on('request', (request) => {
    if (/^\/api\/topics\/\d+$/.test(new URL(request.url()).pathname)) mobileTopicDetailMethods.push(request.method());
  });
  await mobileDetailPage.request.post(`${base}/__qa/fail-next-topic-detail-read`);
  await mobileDetailPage.goto(`${base}/topics/${topic.id}`);
  await mobileDetailPage.getByRole('alert').getByText('选题详情暂时无法读取', { exact: false }).waitFor();
  assert.equal(await mobileDetailPage.getByText('未找到该选题。', { exact: true }).count(), 0, 'a mobile temporary detail-read failure is not presented as a missing topic');
  assert.equal(await mobileDetailPage.getByText('模拟详情读取失败', { exact: true }).count(), 0, 'the mobile failure does not expose the server response body');
  assert.equal(await mobileDetailPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'the 320px mobile error state has no horizontal overflow');
  const mobileRetryBox = await mobileDetailPage.getByRole('button', { name: '重新加载选题详情', exact: true }).boundingBox();
  assert.ok(mobileRetryBox && mobileRetryBox.x >= 0 && mobileRetryBox.x + mobileRetryBox.width <= 320, `the mobile retry action stays inside the viewport: ${JSON.stringify(mobileRetryBox)}`);
  assert.equal((await mobileDetailPage.request.get(`${base}/__qa/topic-detail-state`).then((response) => response.json())).topicDetailReadCount, mobileDetailReadCountBefore + 1, 'the mobile initial failure uses one detail read');
  await mobileDetailPage.getByRole('button', { name: '重新加载选题详情', exact: true }).click();
  const mobileTopicTitle = mobileDetailPage.getByRole('textbox', { name: '选题标题', exact: true });
  await mobileTopicTitle.waitFor();
  assert.equal(await mobileTopicTitle.inputValue(), topic.title, 'mobile retry restores the loaded topic title');
  assert.equal((await mobileDetailPage.request.get(`${base}/__qa/topic-detail-state`).then((response) => response.json())).topicDetailReadCount, mobileDetailReadCountBefore + 2, 'mobile retry performs one additional read and recovers the topic');
  assert.deepEqual(mobileTopicDetailMethods, ['GET', 'GET'], 'mobile detail failure recovery performs no topic mutation');
  await mobileDetailPage.goto(`${base}/topics/999999`);
  await mobileDetailPage.getByRole('status').getByText('未找到该选题，或记录当前不可访问。', { exact: true }).waitFor();
  assert.equal(await mobileDetailPage.getByRole('button', { name: '重新加载选题详情', exact: true }).count(), 0, 'mobile confirmed 404 does not offer a transient-error retry');
  assert.equal(await mobileDetailPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'the 320px mobile 404 state has no horizontal overflow');
  await mobileDetailPage.request.post(`${base}/__qa/fail-next-topic-detail-read`);
  await mobileDetailPage.evaluate((nextId) => {
    const previousState = window.history.state ?? {};
    const nextIndex = Number.isInteger(previousState.idx) ? previousState.idx + 1 : 1;
    window.history.pushState({ ...previousState, usr: null, key: `qa-mobile-topic-${nextId}`, idx: nextIndex }, '', `/topics/${nextId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, topic.id + 1);
  await mobileDetailPage.getByRole('alert').getByText('选题详情暂时无法读取', { exact: false }).waitFor();
  assert.equal(await mobileDetailPage.getByRole('textbox', { name: '选题标题', exact: true }).count(), 0, 'mobile same-page route change does not leave the previous topic editable after a failed read');
  assert.equal(mobileTopicDetailMethods[mobileTopicDetailMethods.length - 1], 'GET', 'mobile same-page route recovery remains read-only');
  await mobileDetailPage.close();
  await page.goto(`${base}/topics`);
  await page.getByRole('heading', { name: '选题管理' }).waitFor();

  const statusFilter = page.getByRole('combobox', { name: '按状态筛选选题' });
  await statusFilter.waitFor();
  assert.equal(await statusFilter.getAttribute('id'), 'topics-status-filter');
  assert.equal(await statusFilter.getAttribute('name'), 'topicsStatusFilter');
  await page.getByRole('button', { name: topic.title, exact: true }).waitFor();
  await page.getByText('待审核选题', { exact: true }).waitFor();
  const lightCurrentPage = page.getByRole('button', { name: '第 1 页', exact: true });
  await lightCurrentPage.waitFor();
  assert.ok((await lightCurrentPage.getAttribute('class'))?.includes('bg-studio-primary-button'), 'active pagination uses the theme-aware primary-button token');
  assert.ok((await elementBackgroundContrast(lightCurrentPage)) >= 4.5, 'light theme current page number maintains at least 4.5:1 contrast');
  const topicListContrastTexts = [
    ['待审核选题', page.getByText('待审核选题', { exact: true })],
    ['生产链路中', page.getByText('生产链路中', { exact: true })],
    ['临期或逾期', page.getByText('临期或逾期', { exact: true })],
    ['视图说明', page.getByText('列表和看板共用选题筛选；日历继续保留独立排期事件入口。', { exact: true })],
    ['负责人表头', page.getByRole('columnheader', { name: '负责人', exact: true })],
    ['平台表头', page.getByRole('columnheader', { name: '平台', exact: true })],
    ['提交时间表头', page.getByRole('columnheader', { name: '提交时间', exact: true })],
    ['截止表头', page.getByRole('columnheader', { name: '截止', exact: true })],
    ['流程表头', page.getByRole('columnheader', { name: '流程', exact: true })],
    ['状态表头', page.getByRole('columnheader', { name: '状态', exact: true })],
    ['操作表头', page.getByRole('columnheader', { name: '操作', exact: true })],
    ['提报人标注', page.getByText('提报：选题列表验收', { exact: true })],
    ['下一步标注', page.getByText('下一步', { exact: true })],
    ['分页摘要', page.getByText('共 31 条，第 1/3 页', { exact: true })],
    ['未选中页码', page.getByRole('button', { name: '第 2 页', exact: true })],
  ] as const;
  for (const [label, locator] of topicListContrastTexts) {
    const ratio = await contrastRatio(locator);
    assert(ratio >= 4.5, `light topic-list ${label} text contrast is ${ratio.toFixed(2)}:1`);
  }

  const boardPage = await context.newPage();
  boardPage.setDefaultTimeout(5000);
  boardPage.on('pageerror', (error) => errors.push(error.message));
  boardPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await boardPage.goto(`${base}/__qa`);
  await boardPage.getByRole('heading', { name: '选题管理' }).waitFor();
  await boardPage.goto(`${base}/topics?view=board`);
  await assertMainButtonTouchTargets(boardPage, 'desktop topic board');
  const pendingBoardColumn = boardPage.locator('[aria-labelledby="topic-column-pending"]');
  await pendingBoardColumn.waitFor();
  await assertTopicsBoardContrast(boardPage, 'light desktop');
  assert.equal(await boardPage.getByText('待审核选题', { exact: true }).count(), 0, 'board mode hides list-only overview metrics');
  assert.equal(await boardPage.locator('[aria-labelledby="priority-topics-title"]').count(), 0, 'board mode hides the list-only priority spotlight');
  const pendingBoardHeadingBox = await pendingBoardColumn.getByRole('heading', { name: '待审核', exact: true }).boundingBox();
  const boardViewportHeight = await boardPage.evaluate(() => window.innerHeight);
  assert.ok(pendingBoardHeadingBox && pendingBoardHeadingBox.y >= 0 && pendingBoardHeadingBox.y + pendingBoardHeadingBox.height <= boardViewportHeight,
    `first board lane heading is visible without scrolling at 1440px: ${JSON.stringify({ pendingBoardHeadingBox, boardViewportHeight })}`);
  for (const [name, id, controlName] of [
    ['看板平台筛选', 'topics-board-platform-filter', 'topicsBoardPlatformFilter'],
    ['看板负责人筛选', 'topics-board-assignee-filter', 'topicsBoardAssigneeFilter'],
  ]) {
    const filter = boardPage.getByRole('combobox', { name });
    await filter.waitFor();
    assert.equal(await filter.getAttribute('id'), id);
    assert.equal(await filter.getAttribute('name'), controlName);
  }
  const boardAuditCard = boardPage.locator('article').filter({ hasText: boardAuditTopic.title });
  const boardAuditAttemptsBefore = boardAuditAttempts;
  let resolveBoardAuditStarted!: () => void;
  const boardAuditStarted = new Promise<void>((resolve) => { resolveBoardAuditStarted = resolve; });
  boardAuditStartedCallback = resolveBoardAuditStarted;
  holdNextBoardAudit = true;
  await boardAuditCard.getByRole('button', { name: '通过', exact: true }).click();
  await boardAuditStarted;
  const pendingBoardAuditButtons = boardAuditCard.getByRole('button', { name: '处理中…', exact: true });
  await pendingBoardAuditButtons.first().waitFor();
  assert.equal(await pendingBoardAuditButtons.count(), 2, 'all stage changes for the same topic expose one in-flight state');
  assert.equal(await pendingBoardAuditButtons.nth(0).isDisabled(), true, 'the in-flight board audit action is disabled');
  assert.equal(await pendingBoardAuditButtons.nth(1).isDisabled(), true, 'a second transition for the topic is disabled');
  assert.equal(boardAuditAttempts, boardAuditAttemptsBefore + 1, 'the board starts only one audit request for the topic');
  releaseBoardAudit?.();
  releaseBoardAudit = null;
  await boardPage.getByText('状态已更新', { exact: true }).waitFor();
  assert.equal(boardAuditTopic.status, 'approved', 'the delayed board audit updates the isolated topic after confirmation');
  assert.equal(boardAuditWrites, 1, 'the board audit is written exactly once');
  assert.equal(boardAuditAttempts, boardAuditAttemptsBefore + 1, 'the board does not issue a duplicate audit write');
  await boardPage.close();

  boardAuditTopic.status = 'pending';
  const mobileBoard = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobileBoard.setDefaultTimeout(5000);
  mobileBoard.on('pageerror', (error) => errors.push(error.message));
  mobileBoard.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mobileBoard.goto(`${base}/__qa`);
  await mobileBoard.getByRole('textbox', { name: '搜索选题' }).waitFor();
  await mobileBoard.goto(`${base}/topics?view=board`);
  await assertTopicsBoardContrast(mobileBoard, 'light mobile');
  for (const width of [390, 320, 1440]) {
    await mobileBoard.setViewportSize({ width, height: width === 320 ? 800 : 844 });
    await assertMainButtonTouchTargets(mobileBoard, `topic board at ${width}px`);
    assert.ok(await mobileBoard.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `topic board has no page-level overflow at ${width}px`);
  }
  await mobileBoard.setViewportSize({ width: 390, height: 844 });
  const mobileBoardAuditCard = mobileBoard.locator('article').filter({ hasText: boardAuditTopic.title });
  let resolveMobileBoardAuditStarted!: () => void;
  const mobileBoardAuditStarted = new Promise<void>((resolve) => { resolveMobileBoardAuditStarted = resolve; });
  boardAuditStartedCallback = resolveMobileBoardAuditStarted;
  holdNextBoardAudit = true;
  const mobileAttemptsBefore = boardAuditAttempts;
  await mobileBoardAuditCard.getByRole('button', { name: '通过', exact: true }).click();
  await mobileBoardAuditStarted;
  const pendingMobileBoardButtons = mobileBoardAuditCard.getByRole('button', { name: '处理中…', exact: true });
  await pendingMobileBoardButtons.first().waitFor();
  assert.equal(await pendingMobileBoardButtons.count(), 2, 'mobile board blocks all transitions for the in-flight topic');
  assert.ok(await pendingMobileBoardButtons.nth(0).isDisabled() && await pendingMobileBoardButtons.nth(1).isDisabled(), 'mobile board transition buttons are disabled until confirmation');
  assert.equal(boardAuditAttempts, mobileAttemptsBefore + 1, 'the mobile board starts one audit request');
  releaseBoardAudit?.();
  releaseBoardAudit = null;
  await mobileBoard.getByText('状态已更新', { exact: true }).waitFor();
  assert.equal(boardAuditTopic.status, 'approved', 'the mobile board applies the confirmed audit result');
  assert.equal(boardAuditWrites, 2, 'desktop and mobile board audits each write exactly once');
  assert.equal(boardAuditAttempts, mobileAttemptsBefore + 1, 'the mobile board does not issue a duplicate audit write');
  await mobileBoard.close();

  const boardRecoveryPage = await context.newPage();
  boardRecoveryPage.setDefaultTimeout(5000);
  boardRecoveryPage.on('pageerror', (error) => errors.push(error.message));
  boardRecoveryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  await boardRecoveryPage.goto(`${base}/__qa`);
  await boardRecoveryPage.getByRole('heading', { name: '选题管理' }).waitFor();
  await boardRecoveryPage.request.post(`${base}/__qa/reset-board-audit`);
  await boardRecoveryPage.goto(`${base}/topics?view=board`);
  const boardRecoveryCard = boardRecoveryPage.locator('article').filter({ hasText: boardAuditTopic.title });
  await boardRecoveryCard.getByRole('button', { name: '通过', exact: true }).waitFor();
  await boardRecoveryPage.request.post(`${base}/__qa/commit-next-board-audit-then-fail`);
  const committedBoardBefore = await boardRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  await boardRecoveryCard.getByRole('button', { name: '通过', exact: true }).click();
  await boardRecoveryPage.getByText('状态已更新', { exact: true }).waitFor();
  const committedBoardAfter = await boardRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(committedBoardAfter.status, 'approved', 'read-back confirms a board audit committed before its response was lost');
  assert.equal(committedBoardAfter.boardAuditAttempts - committedBoardBefore.boardAuditAttempts, 1, 'a committed board audit with a lost response is never resent');
  assert.equal(committedBoardAfter.boardAuditWrites - committedBoardBefore.boardAuditWrites, 1, 'the ambiguous board audit writes exactly once');

  await boardRecoveryPage.request.post(`${base}/__qa/reset-board-audit`);
  await boardRecoveryPage.goto(`${base}/topics?view=board`);
  await boardRecoveryCard.getByRole('button', { name: '通过', exact: true }).waitFor();
  await boardRecoveryPage.request.post(`${base}/__qa/fail-next-board-audit-and-read`);
  const uncertainBoardBefore = await boardRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  await boardRecoveryCard.getByRole('button', { name: '通过', exact: true }).click();
  const boardStatusLock = boardRecoveryPage.getByRole('alert').filter({ hasText: '审核或状态更新结果暂时无法确认' });
  await boardStatusLock.waitFor();
  const lockedBoardAction = boardRecoveryCard.getByRole('button', { name: '通过', exact: true });
  assert.equal(await lockedBoardAction.isDisabled(), true, 'an unreadable board audit result locks further transitions for that card');
  const unknownBoardState = await boardRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(unknownBoardState.boardAuditAttempts - uncertainBoardBefore.boardAuditAttempts, 1, 'an unreadable board audit result does not cause an automatic retry');
  await boardStatusLock.getByRole('button', { name: '只读核实', exact: true }).click();
  await boardRecoveryPage.getByText('只读核实完成', { exact: true }).waitFor();
  assert.equal(await lockedBoardAction.isDisabled(), false, 'a read-back confirming the original state unlocks a deliberate board retry');
  const afterBoardReadback = await boardRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(afterBoardReadback.boardAuditAttempts, unknownBoardState.boardAuditAttempts, 'board read-only verification sends no audit request');
  await lockedBoardAction.click();
  await boardRecoveryPage.getByText('状态已更新', { exact: true }).waitFor();
  const afterBoardRetry = await boardRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(afterBoardRetry.status, 'approved', 'the explicit board retry applies after the original state is verified');
  assert.equal(afterBoardRetry.boardAuditAttempts - afterBoardReadback.boardAuditAttempts, 1, 'only the deliberate retry adds a board audit request');
  assert.equal(afterBoardRetry.boardAuditWrites - afterBoardReadback.boardAuditWrites, 1, 'the deliberate board retry writes exactly once');
  await boardRecoveryPage.request.post(`${base}/__qa/reset-board-audit`);
  await boardRecoveryPage.close();

  const mobileStatusRecoveryPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobileStatusRecoveryPage.setDefaultTimeout(5000);
  mobileStatusRecoveryPage.on('pageerror', (error) => errors.push(error.message));
  mobileStatusRecoveryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  await mobileStatusRecoveryPage.goto(`${base}/__qa`);
  await mobileStatusRecoveryPage.getByRole('textbox', { name: '搜索选题' }).waitFor();
  await mobileStatusRecoveryPage.request.post(`${base}/__qa/reset-board-audit`);
  await mobileStatusRecoveryPage.goto(`${base}/topics?view=board`);
  const mobileStatusCard = mobileStatusRecoveryPage.locator('article').filter({ hasText: boardAuditTopic.title });
  await mobileStatusCard.getByRole('button', { name: '通过', exact: true }).waitFor();
  await mobileStatusRecoveryPage.request.post(`${base}/__qa/commit-next-board-audit-then-fail`);
  const mobileCommittedBefore = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  await mobileStatusCard.getByRole('button', { name: '通过', exact: true }).click();
  await mobileStatusRecoveryPage.getByText('状态更新已确认', { exact: false }).waitFor();
  const mobileCommittedAfter = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(mobileCommittedAfter.status, 'approved', 'mobile board read-back confirms a transition committed before its response was lost');
  assert.equal(mobileCommittedAfter.boardAuditAttempts - mobileCommittedBefore.boardAuditAttempts, 1, 'mobile board never resends a committed transition with an ambiguous response');
  assert.equal(mobileCommittedAfter.boardAuditWrites - mobileCommittedBefore.boardAuditWrites, 1, 'mobile board committed transition is written exactly once');

  await mobileStatusRecoveryPage.request.post(`${base}/__qa/reset-board-audit`);
  await mobileStatusRecoveryPage.goto(`${base}/topics?view=board`);
  await mobileStatusCard.getByRole('button', { name: '通过', exact: true }).waitFor();
  await mobileStatusRecoveryPage.request.post(`${base}/__qa/fail-next-board-audit-and-read`);
  const mobileUncertainBefore = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  await mobileStatusCard.getByRole('button', { name: '通过', exact: true }).click();
  const mobileStatusLock = mobileStatusRecoveryPage.getByRole('alert').filter({ hasText: '状态更新结果暂时无法确认' });
  await mobileStatusLock.waitFor();
  const lockedMobileStatusAction = mobileStatusCard.getByRole('button', { name: '通过', exact: true });
  assert.equal(await lockedMobileStatusAction.isDisabled(), true, 'mobile board locks a topic while its write and first read-back are both unavailable');
  const mobileUncertainAfterWrite = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(mobileUncertainAfterWrite.boardAuditAttempts - mobileUncertainBefore.boardAuditAttempts, 1, 'mobile board does not automatically retry after an unreadable result');
  await mobileStatusLock.getByRole('button', { name: '只读核实', exact: true }).click();
  await mobileStatusRecoveryPage.getByText('状态尚未改变', { exact: false }).waitFor();
  assert.equal(await lockedMobileStatusAction.isDisabled(), false, 'mobile board unlocks only after read-back confirms the original status');
  const mobileAfterReadback = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(mobileAfterReadback.boardAuditAttempts, mobileUncertainAfterWrite.boardAuditAttempts, 'mobile read-only verification sends no audit request');
  await lockedMobileStatusAction.click();
  await mobileStatusRecoveryPage.getByText('状态已更新', { exact: false }).waitFor();
  const mobileAfterExplicitRetry = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(mobileAfterExplicitRetry.status, 'approved', 'mobile explicit retry applies after the original status is confirmed');
  assert.equal(mobileAfterExplicitRetry.boardAuditAttempts - mobileAfterReadback.boardAuditAttempts, 1, 'only the explicit mobile retry adds a write request');
  assert.equal(mobileAfterExplicitRetry.boardAuditWrites - mobileAfterReadback.boardAuditWrites, 1, 'the explicit mobile retry writes exactly once');

  await mobileStatusRecoveryPage.request.post(`${base}/__qa/reset-board-audit`);
  await mobileStatusRecoveryPage.goto(`${base}/topics/952`);
  await mobileStatusRecoveryPage.getByRole('heading', { name: '选题审核', exact: true }).waitFor();
  await mobileStatusRecoveryPage.getByRole('button', { name: '开始审核', exact: true }).click();
  await mobileStatusRecoveryPage.getByRole('button', { name: '通过', exact: true }).waitFor();
  await mobileStatusRecoveryPage.request.post(`${base}/__qa/commit-next-board-audit-then-fail`);
  const mobileDetailCommittedBefore = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  await mobileStatusRecoveryPage.getByRole('button', { name: '确认通过选题', exact: true }).click();
  await mobileStatusRecoveryPage.getByText('只读核实已确认审核结果', { exact: false }).waitFor();
  const mobileDetailCommittedAfter = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(mobileDetailCommittedAfter.status, 'approved', 'mobile detail read-back confirms an audit committed before its response was lost');
  assert.equal(mobileDetailCommittedAfter.boardAuditAttempts - mobileDetailCommittedBefore.boardAuditAttempts, 1, 'mobile detail never resends a committed audit with an ambiguous response');
  assert.equal(mobileDetailCommittedAfter.boardAuditWrites - mobileDetailCommittedBefore.boardAuditWrites, 1, 'mobile detail committed audit is written exactly once');

  await mobileStatusRecoveryPage.request.post(`${base}/__qa/reset-board-audit`);
  await mobileStatusRecoveryPage.reload();
  await mobileStatusRecoveryPage.getByRole('heading', { name: '选题审核', exact: true }).waitFor();
  await mobileStatusRecoveryPage.request.post(`${base}/__qa/fail-next-board-audit-and-read`);
  const mobileDetailUncertainBefore = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  await mobileStatusRecoveryPage.getByRole('button', { name: '开始审核', exact: true }).click();
  const mobileAuditComment = mobileStatusRecoveryPage.getByRole('textbox', { name: '审核意见（选填）' });
  await mobileAuditComment.fill('隔离夹具中的移动端审核意见');
  await mobileStatusRecoveryPage.getByRole('button', { name: '确认通过选题', exact: true }).click();
  const mobileDetailStatusLock = mobileStatusRecoveryPage.getByRole('alert').filter({ hasText: '上一次审核结果暂时无法确认' });
  await mobileDetailStatusLock.waitFor();
  const lockedMobileAuditSubmit = mobileStatusRecoveryPage.getByRole('button', { name: '确认通过选题', exact: true });
  assert.equal(await lockedMobileAuditSubmit.isDisabled(), true, 'mobile detail locks audit submission when the write and first read-back are both unavailable');
  assert.equal(await mobileAuditComment.inputValue(), '隔离夹具中的移动端审核意见', 'mobile detail preserves the explicit audit form while the outcome is uncertain');
  const mobileDetailUncertainAfter = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(mobileDetailUncertainAfter.boardAuditAttempts - mobileDetailUncertainBefore.boardAuditAttempts, 1, 'mobile detail does not automatically retry after an unreadable audit result');
  await mobileDetailStatusLock.getByRole('button', { name: '只读核实', exact: true }).click();
  await mobileStatusRecoveryPage.getByText('只读核实确认选题仍为待审核', { exact: false }).waitFor();
  assert.equal(await lockedMobileAuditSubmit.isDisabled(), false, 'mobile detail unlocks only after read-back confirms the original status');
  assert.equal(await mobileAuditComment.inputValue(), '隔离夹具中的移动端审核意见', 'read-only verification keeps the audit comment for an explicit retry');
  const mobileDetailAfterReadback = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(mobileDetailAfterReadback.boardAuditAttempts, mobileDetailUncertainAfter.boardAuditAttempts, 'mobile detail read-only verification sends no audit request');
  await lockedMobileAuditSubmit.click();
  await mobileStatusRecoveryPage.getByText('选题审核已通过', { exact: false }).waitFor();
  const mobileDetailAfterRetry = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-audit-state`).then((response) => response.json());
  assert.equal(mobileDetailAfterRetry.status, 'approved', 'mobile detail explicit retry applies after original status is confirmed');
  assert.equal(mobileDetailAfterRetry.boardAuditAttempts - mobileDetailAfterReadback.boardAuditAttempts, 1, 'only the deliberate mobile detail retry adds a write request');
  assert.equal(mobileDetailAfterRetry.boardAuditWrites - mobileDetailAfterReadback.boardAuditWrites, 1, 'the deliberate mobile detail retry writes exactly once');

  await mobileStatusRecoveryPage.request.post(`${base}/__qa/reset-board-status`);
  await mobileStatusRecoveryPage.goto(`${base}/topics/953`);
  await mobileStatusRecoveryPage.getByText('拍摄中', { exact: true }).waitFor();
  const mobileAdvanceButton = mobileStatusRecoveryPage.getByRole('button', { name: '进入发布', exact: true });
  await mobileAdvanceButton.waitFor();
  await mobileStatusRecoveryPage.request.post(`${base}/__qa/commit-next-board-status-then-fail`);
  const mobileAdvanceCommittedBefore = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-status-state`).then((response) => response.json());
  await mobileAdvanceButton.click();
  await mobileStatusRecoveryPage.getByText('只读核实已确认状态为发布中', { exact: false }).waitFor();
  assert.equal(await mobileStatusRecoveryPage.getByRole('alert').filter({ hasText: '缺少发布记录' }).count(), 0, 'mobile detail read-back also restores the latest stage-record presence');
  const mobileAdvanceCommittedAfter = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-status-state`).then((response) => response.json());
  assert.equal(mobileAdvanceCommittedAfter.status, 'publishing', 'mobile detail read-back confirms a status transition committed before its response was lost');
  assert.equal(mobileAdvanceCommittedAfter.boardStatusAttempts - mobileAdvanceCommittedBefore.boardStatusAttempts, 1, 'mobile detail never resends a committed status transition');
  assert.equal(mobileAdvanceCommittedAfter.boardStatusWrites - mobileAdvanceCommittedBefore.boardStatusWrites, 1, 'mobile detail committed status transition writes exactly once');

  await mobileStatusRecoveryPage.request.post(`${base}/__qa/reset-board-status`);
  await mobileStatusRecoveryPage.reload();
  await mobileStatusRecoveryPage.getByText('拍摄中', { exact: true }).waitFor();
  await mobileStatusRecoveryPage.getByRole('button', { name: '进入发布', exact: true }).waitFor();
  await mobileStatusRecoveryPage.request.post(`${base}/__qa/fail-next-board-status-and-read`);
  const mobileAdvanceUncertainBefore = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-status-state`).then((response) => response.json());
  await mobileStatusRecoveryPage.getByRole('button', { name: '进入发布', exact: true }).click();
  const mobileAdvanceLock = mobileStatusRecoveryPage.getByRole('alert').filter({ hasText: '上一次状态更新结果暂时无法确认' });
  await mobileAdvanceLock.waitFor();
  const lockedMobileAdvance = mobileStatusRecoveryPage.getByRole('button', { name: '进入发布', exact: true });
  assert.equal(await lockedMobileAdvance.isDisabled(), true, 'mobile detail locks status transition when its write and first read-back are both unavailable');
  const mobileAdvanceUncertainAfter = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-status-state`).then((response) => response.json());
  assert.equal(mobileAdvanceUncertainAfter.boardStatusAttempts - mobileAdvanceUncertainBefore.boardStatusAttempts, 1, 'mobile detail does not automatically retry an unreadable status transition');
  await mobileAdvanceLock.getByRole('button', { name: '只读核实', exact: true }).click();
  await mobileStatusRecoveryPage.getByText('只读核实确认选题仍为拍摄中', { exact: false }).waitFor();
  assert.equal(await lockedMobileAdvance.isDisabled(), false, 'mobile detail unlocks transition only after read-back confirms the original status');
  const mobileAdvanceAfterReadback = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-status-state`).then((response) => response.json());
  assert.equal(mobileAdvanceAfterReadback.boardStatusAttempts, mobileAdvanceUncertainAfter.boardStatusAttempts, 'mobile detail status read-only verification sends no write');
  await lockedMobileAdvance.click();
  await mobileStatusRecoveryPage.getByText('已推进至发布中', { exact: false }).waitFor();
  const mobileAdvanceAfterRetry = await mobileStatusRecoveryPage.request.get(`${base}/__qa/board-status-state`).then((response) => response.json());
  assert.equal(mobileAdvanceAfterRetry.status, 'publishing', 'mobile detail explicit status retry applies after original state is confirmed');
  assert.equal(mobileAdvanceAfterRetry.boardStatusAttempts - mobileAdvanceAfterReadback.boardStatusAttempts, 1, 'only the explicit mobile detail retry adds a status request');
  assert.equal(mobileAdvanceAfterRetry.boardStatusWrites - mobileAdvanceAfterReadback.boardStatusWrites, 1, 'the explicit mobile detail retry writes exactly once');
  await mobileStatusRecoveryPage.request.post(`${base}/__qa/reset-board-audit`);
  await mobileStatusRecoveryPage.request.post(`${base}/__qa/reset-board-status`);
  await mobileStatusRecoveryPage.close();

  const mobileListPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mobileListPage.setDefaultTimeout(5000);
  const mobileTopicListRequests: string[] = [];
  mobileListPage.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('/api/topics?')) mobileTopicListRequests.push(request.url());
  });
  mobileListPage.on('pageerror', (error) => errors.push(error.message));
  mobileListPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await mobileListPage.goto(`${base}/__qa`);
  const mobileTopicFilters = mobileListPage.getByRole('group', { name: '选题筛选', exact: true });
  const mobileViewToggle = mobileListPage.getByRole('group', { name: '选题视图切换', exact: true });
  await mobileTopicFilters.waitFor();
  await mobileViewToggle.waitFor();
  assert.equal(await mobileTopicFilters.getByRole('button').count(), 5, 'the mobile topic filter group exposes all five filter buttons');
  for (const width of [390, 320]) {
    await mobileListPage.setViewportSize({ width, height: 844 });
    await assertMainButtonTouchTargets(mobileListPage, `topic list at ${width}px`);
    assert.equal(await mobileViewToggle.getByRole('button').count(), 2, `both view controls remain available at ${width}px`);
    const filterLayout = await mobileTopicFilters.evaluate((group) => {
      const groupRect = group.getBoundingClientRect();
      const buttons = Array.from(group.querySelectorAll('button'), (button) => {
        const rect = button.getBoundingClientRect();
        return { label: button.innerText.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        groupWidth: groupRect.width,
        groupScrollWidth: group.scrollWidth,
        groupClientWidth: group.clientWidth,
        buttons,
      };
    });
    assert.equal(filterLayout.viewportWidth, width, `mobile topic filters use the ${width}px layout viewport`);
    assert.equal(filterLayout.documentWidth, width, `mobile topic list has no document overflow at ${width}px`);
    assert.ok(filterLayout.groupScrollWidth <= filterLayout.groupClientWidth + 1, `mobile topic filters do not hide horizontally clipped options at ${width}px`);
    assert.equal(filterLayout.buttons.length, 5, `all mobile topic filters remain mounted at ${width}px`);
    for (const button of filterLayout.buttons) {
      assert.ok(button.left >= -1 && button.right <= width + 1, `${button.label} stays fully visible at ${width}px: ${JSON.stringify(button)}`);
      assert.ok(button.bottom > button.top, `${button.label} has a visible layout box at ${width}px`);
    }
  }
  await mobileListPage.goto(`${base}/__qa?filter_fixture=true`);
  await mobileListPage.getByText('23 个选题', { exact: true }).waitFor();
  await mobileListPage.getByRole('status', { name: '筛选结果：全部，共 23 个选题，第 1 页。', exact: true }).waitFor();
  await mobileTopicFilters.getByRole('button', { name: '我的', exact: true }).click();
  await mobileListPage.getByText('21 个选题', { exact: true }).waitFor();
  await mobileListPage.getByRole('status', { name: '筛选结果：我的，共 21 个选题，第 1 页。', exact: true }).waitFor();
  assert.equal(new URL(mobileListPage.url()).searchParams.get('topic_filter'), 'mine', 'the mobile mine filter remains reflected in the URL');
  let lastTopicListRequest = mobileTopicListRequests.at(-1);
  assert.ok(lastTopicListRequest && new URL(lastTopicListRequest).searchParams.get('topic_filter') === 'mine', 'mine is requested from the server, not filtered only in the loaded page');
  assert.equal(await mobileListPage.locator('button.xmt-card').count(), 20, 'the first filtered page contains 20 of the 21 owned topics');
  await mobileListPage.getByRole('button', { name: '下一页', exact: true }).click();
  await mobileListPage.getByRole('button', { name: '第 2 页', exact: true }).waitFor();
  await mobileListPage.getByRole('status', { name: '筛选结果：我的，共 21 个选题，第 2 页。', exact: true }).waitFor();
  assert.equal(await mobileListPage.locator('button.xmt-card').count(), 1, 'the final mine page contains the one remaining owned topic');
  assert.equal(await mobileListPage.getByRole('button', { name: /筛选分页验收选题 21/ }).count(), 1, 'the second page contains the final matching topic');
  lastTopicListRequest = mobileTopicListRequests.at(-1);
  assert.ok(lastTopicListRequest && new URL(lastTopicListRequest).searchParams.get('page') === '2', 'the filtered page number is sent to the server');
  await mobileTopicFilters.getByRole('button', { name: '进行中', exact: true }).click();
  await mobileListPage.getByText('14 个选题', { exact: true }).waitFor();
  assert.equal(await mobileListPage.locator('button.xmt-card').count(), 14, 'active filter displays only the 14 server-matched topics');
  await mobileListPage.getByRole('status', { name: '筛选结果：进行中，共 14 个选题，第 1 页。', exact: true }).waitFor();
  lastTopicListRequest = mobileTopicListRequests.at(-1);
  assert.ok(lastTopicListRequest && new URL(lastTopicListRequest).searchParams.get('topic_filter') === 'active', 'active is requested from the server');
  await mobileListPage.getByRole('textbox', { name: '搜索选题' }).fill('本地夹具不存在的标题');
  await mobileListPage.getByRole('status', { name: '进行中筛选没有符合条件的选题。', exact: true }).waitFor();
  await mobileListPage.getByText('没有符合条件的选题', { exact: true }).waitFor();
  await mobileListPage.close();

  const darkContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const darkPage = await darkContext.newPage();
  darkPage.on('pageerror', (error) => errors.push(error.message));
  darkPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await darkPage.goto(`${base}/__qa?theme=dark`);
  await darkPage.getByRole('heading', { name: '选题管理' }).waitFor();
  await assertMainButtonTouchTargets(darkPage, 'dark desktop topic list');
  const darkCurrentPage = darkPage.getByRole('button', { name: '第 1 页', exact: true });
  await darkCurrentPage.waitFor();
  assert.ok((await darkCurrentPage.getAttribute('class'))?.includes('bg-studio-primary-button'), 'dark active pagination uses the theme-aware primary-button token');
  const darkContrast = await elementBackgroundContrast(darkCurrentPage);
  assert.ok(darkContrast >= 4.5, `dark theme current page number maintains at least 4.5:1 contrast; received ${darkContrast.toFixed(2)}:1`);
  const darkTopicListContrastTexts = [
    ['待审核选题', darkPage.getByText('待审核选题', { exact: true })],
    ['生产链路中', darkPage.getByText('生产链路中', { exact: true })],
    ['临期或逾期', darkPage.getByText('临期或逾期', { exact: true })],
    ['视图说明', darkPage.getByText('列表和看板共用选题筛选；日历继续保留独立排期事件入口。', { exact: true })],
    ['负责人表头', darkPage.getByRole('columnheader', { name: '负责人', exact: true })],
    ['平台表头', darkPage.getByRole('columnheader', { name: '平台', exact: true })],
    ['提交时间表头', darkPage.getByRole('columnheader', { name: '提交时间', exact: true })],
    ['截止表头', darkPage.getByRole('columnheader', { name: '截止', exact: true })],
    ['流程表头', darkPage.getByRole('columnheader', { name: '流程', exact: true })],
    ['状态表头', darkPage.getByRole('columnheader', { name: '状态', exact: true })],
    ['操作表头', darkPage.getByRole('columnheader', { name: '操作', exact: true })],
    ['提报人标注', darkPage.getByText('提报：选题列表验收', { exact: true })],
    ['下一步标注', darkPage.getByText('下一步', { exact: true })],
    ['分页摘要', darkPage.getByText('共 31 条，第 1/3 页', { exact: true })],
    ['未选中页码', darkPage.getByRole('button', { name: '第 2 页', exact: true })],
  ] as const;
  for (const [label, locator] of darkTopicListContrastTexts) {
    const ratio = await contrastRatio(locator);
    assert(ratio >= 4.5, `dark topic-list ${label} text contrast is ${ratio.toFixed(2)}:1`);
  }

  const darkBoardPage = await darkContext.newPage();
  await darkBoardPage.goto(`${base}/topics?view=board`);
  await assertMainButtonTouchTargets(darkBoardPage, 'dark desktop topic board');
  await assertTopicsBoardContrast(darkBoardPage, 'dark desktop');
  await darkBoardPage.close();

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
      // Native browser zoom changes the CSS layout viewport; root CSS zoom does not trigger the same reflow breakpoints.
      const effectiveViewport = {
        width: Math.round(viewport.width / zoom),
        height: Math.round(viewport.height / zoom),
      };
      await page.setViewportSize(effectiveViewport);
      await assertMainButtonTouchTargets(page, `topic list at ${viewport.width}px / ${zoom * 100}%`);
      const currentViewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
      assert.deepEqual(currentViewport, effectiveViewport, `browser zoom ${zoom * 100}% uses the equivalent CSS layout viewport for ${viewport.width}x${viewport.height}`);
      for (const name of ['查看', '删除']) {
        const accessibleName = name === '查看' ? `查看选题 ${topic.title}` : `删除选题 ${topic.title}`;
        const button = page.locator('tbody').getByRole('button', { name: accessibleName, exact: true }).first();
        await button.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
        const geometry = await button.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const clippedBy: string[] = [];
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            const ancestorRect = ancestor.getBoundingClientRect();
            const clipsX = ['hidden', 'clip'].includes(style.overflowX);
            const clipsY = ['hidden', 'clip'].includes(style.overflowY);
            if ((clipsX && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1))
              || (clipsY && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1))) {
              clippedBy.push(`${ancestor.tagName}.${String(ancestor.className)}`);
            }
          }
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            display: getComputedStyle(element).display,
            visibility: getComputedStyle(element).visibility,
            opacity: Number(getComputedStyle(element).opacity),
            clippedBy,
          };
        });
        assert.ok(geometry.width > 0 && geometry.height > 0, `${name} has a layout box at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.width >= 40 && geometry.height >= 40, `${name} has a 40px minimum target at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
        assert.notEqual(geometry.display, 'none', `${name} is not hidden at ${viewport.width}px / ${zoom * 100}%`);
        assert.notEqual(geometry.visibility, 'hidden', `${name} is visible at ${viewport.width}px / ${zoom * 100}%`);
        assert.ok(geometry.opacity >= 0.69, `${name} remains visually discoverable before hover at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
        assert.deepEqual(geometry.clippedBy, [], `${name} is not clipped at ${viewport.width}px / ${zoom * 100}%`);
        assert.ok(geometry.x >= -1 && geometry.x + geometry.width <= geometry.viewportWidth + 1, `${name} stays within the viewport at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.y >= -1 && geometry.y + geometry.height <= geometry.viewportHeight + 1, `${name} can be scrolled into the viewport at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(geometry)}`);
      }
      const nextStep = page.locator('tbody').getByRole('button', { name: '进入创作', exact: true });
      const nextStepGeometry = await nextStep.evaluate((element) => {
        const nextRect = element.getBoundingClientRect();
        const row = element.closest('tr');
        const actionRect = row?.querySelector('td:last-child')?.getBoundingClientRect();
        const overlap = actionRect ? Math.max(0, Math.min(nextRect.right, actionRect.right) - Math.max(nextRect.left, actionRect.left)) : 0;
        return { x: nextRect.x, width: nextRect.width, right: nextRect.right, overlapWithStickyActions: overlap, viewportWidth: window.innerWidth };
      });
      assert.ok(nextStepGeometry.overlapWithStickyActions <= 1, `下一步按钮必须避开固定操作列 at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(nextStepGeometry)}`);
      const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert.equal(pageOverflow, false, `page content does not create horizontal overflow at ${viewport.width}px / ${zoom * 100}%`);
      const workflowCell = page.locator('tbody tr').filter({ hasText: topic.title }).first().locator('td').nth(6);
      const renderedStageLabels = await workflowCell.locator('span').filter({ hasText: /^(审核|通过|创作|成片|发布|完成)$/ }).evaluateAll((elements) => elements.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return { label: element.textContent?.trim(), lineCount: range.getClientRects().length };
      }));
      assert.deepEqual(renderedStageLabels.map((stage) => stage.label), ['审核', '通过', '创作', '成片', '发布', '完成']);
      assert.deepEqual(renderedStageLabels.map((stage) => stage.lineCount), [1, 1, 1, 1, 1, 1], `选题流程阶段文字须保持单行 at ${viewport.width}px / ${zoom * 100}%: ${JSON.stringify(renderedStageLabels)}`);
    }
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  const topicTitle = page.getByRole('button', { name: topic.title, exact: true });
  await topicTitle.hover();
  await page.waitForTimeout(250);
  const titleContrast = await textContrast(topicTitle);
  assert.ok(titleContrast.ratio >= 4.5, `选题标题悬停文字需保持 4.5:1 对比度，实际 ${titleContrast.ratio.toFixed(2)}:1 on ${titleContrast.rowBackground}`);
  const sortButton = page.locator('thead th button').filter({ hasText: '选题' });
  await sortButton.hover();
  await page.waitForTimeout(250);
  const sortContrast = await textContrast(sortButton);
  assert.ok(sortContrast.ratio >= 4.5, `选题列表排序表头悬停文字需保持 4.5:1 对比度，实际 ${sortContrast.ratio.toFixed(2)}:1 on ${sortContrast.rowBackground}`);
  const darkTopicTitle = darkPage.getByRole('button', { name: topic.title, exact: true });
  await darkTopicTitle.hover();
  const darkTitleContrast = await textContrast(darkTopicTitle);
  assert.ok(darkTitleContrast.ratio >= 4.5, `深色主题选题标题悬停文字需保持 4.5:1 对比度，实际 ${darkTitleContrast.ratio.toFixed(2)}:1 on ${darkTitleContrast.rowBackground}`);
  const darkSortButton = darkPage.locator('thead th button').filter({ hasText: '选题' });
  await darkSortButton.hover();
  const darkSortContrast = await textContrast(darkSortButton);
  assert.ok(darkSortContrast.ratio >= 4.5, `深色主题排序表头悬停文字需保持 4.5:1 对比度，实际 ${darkSortContrast.ratio.toFixed(2)}:1 on ${darkSortContrast.rowBackground}`);

  const lightDeleteAction = page.getByRole('button', { name: `删除选题 ${topic.title}` });
  await lightDeleteAction.hover();
  const lightDeleteBackground = await lightDeleteAction.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(hasVisibleAlpha(lightDeleteBackground), `light theme topic delete hover applies a visible semantic background; received ${lightDeleteBackground}`);
  assert.ok(await contrastRatio(lightDeleteAction.locator('svg')) >= 3, 'light theme hovered topic delete icon maintains at least 3:1 contrast');
  const lightViewAction = page.getByRole('button', { name: `查看选题 ${topic.title}` });
  await lightViewAction.hover();
  const lightViewBackground = await lightViewAction.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(hasVisibleAlpha(lightViewBackground), 'light theme topic view hover applies a visible surface');
  assert.ok(await contrastRatio(lightViewAction.locator('svg')) >= 3, 'light theme hovered topic view icon maintains at least 3:1 contrast');

  const darkDeleteAction = darkPage.getByRole('button', { name: `删除选题 ${topic.title}` });
  await darkDeleteAction.hover();
  const darkDeleteBackground = await darkDeleteAction.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(hasVisibleAlpha(darkDeleteBackground), `dark theme topic delete hover applies a visible semantic background; received ${darkDeleteBackground}`);
  assert.ok(await contrastRatio(darkDeleteAction.locator('svg')) >= 3, 'dark theme hovered topic delete icon maintains at least 3:1 contrast');
  const darkViewAction = darkPage.getByRole('button', { name: `查看选题 ${topic.title}` });
  await darkViewAction.hover();
  const darkViewBackground = await darkViewAction.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(hasVisibleAlpha(darkViewBackground), 'dark theme topic view hover applies a visible surface');
  assert.ok(await contrastRatio(darkViewAction.locator('svg')) >= 3, 'dark theme hovered topic view icon maintains at least 3:1 contrast');

  for (const [qaPage, theme] of [[page, 'light'], [darkPage, 'dark']] as const) {
    const selectTopic = qaPage.getByRole('button', { name: `选择选题：${topic.title}` });
    assert.equal(await selectTopic.getAttribute('aria-pressed'), 'false', `${theme} theme topic selection control starts unselected`);
    await selectTopic.click();
    assert.equal(await selectTopic.getAttribute('aria-pressed'), 'true', `${theme} theme topic selection control exposes its selected state`);
    const rejectAction = qaPage.getByRole('button', { name: '驳回', exact: true });
    const deleteAction = qaPage.getByRole('button', { name: '删除', exact: true });
    for (const [action, label] of [[rejectAction, 'reject'], [deleteAction, 'delete']] as const) {
      const beforeHover = await action.evaluate((element) => getComputedStyle(element).backgroundColor);
      await action.hover();
      const hoverBackground = await action.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert(hasVisibleAlpha(hoverBackground) && hoverBackground !== beforeHover, `${theme} bulk ${label} action applies a visible hover change`);
      assert.ok(await contrastRatio(action) >= 4.5, `${theme} bulk ${label} action text maintains at least 4.5:1 contrast`);
    }
    await qaPage.getByRole('button', { name: '取消选择', exact: true }).click();
    assert.equal(await qaPage.getByRole('button', { name: '驳回', exact: true }).count(), 0, `${theme} bulk actions hide when selection is canceled`);
  }

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await page.getByRole('heading', { name: '选题管理' }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `Topics page fits a ${width}px viewport without page-level horizontal overflow`);
    const tableScroller = page.locator('table').locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")]').first();
    await tableScroller.evaluate((element) => { element.scrollLeft = 0; });
    await page.getByRole('button', { name: `选择选题：${topic.title}` }).click();
    const selectionToolbar = page.getByText('已选 1 个选题', { exact: true }).locator('..');
    await selectionToolbar.waitFor();
    const toolbarBox = await selectionToolbar.boundingBox();
    assert(toolbarBox && toolbarBox.x >= 0 && toolbarBox.x + toolbarBox.width <= width + 1, `selected-topic toolbar stays within the ${width}px viewport: ${JSON.stringify(toolbarBox)}`);
    for (const label of ['通过', '驳回', '删除', '取消选择']) {
      const action = selectionToolbar.getByRole('button', { name: label, exact: true });
      const box = await action.boundingBox();
      assert(box && box.width > 0 && box.x >= 0 && box.x + box.width <= width + 1, `bulk ${label} action stays visible in the ${width}px viewport: ${JSON.stringify(box)}`);
    }
    await selectionToolbar.getByRole('button', { name: '取消选择', exact: true }).click();
    assert.equal(await page.getByText('已选 1 个选题', { exact: true }).count(), 0, `selection toolbar closes after cancel at ${width}px`);
    await tableScroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    for (const label of [`查看选题 ${topic.title}`, `删除选题 ${topic.title}`]) {
      const action = page.getByRole('button', { name: label });
      const box = await action.boundingBox();
      assert(box && box.x >= 0 && box.x + box.width <= width + 1, `${label} stays visible in the sticky action column at ${width}px`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.request.post(`${base}/__qa/reset-batch-audit`);
  await page.reload();
  await page.getByRole('table').getByText('待审核', { exact: true }).waitFor();
  const batchAuditSelection = page.getByRole('button', { name: `选择选题：${topic.title}`, exact: true });
  await batchAuditSelection.click();
  const batchAuditToolbar = page.getByText('已选 1 个选题', { exact: true }).locator('..');
  await page.request.post(`${base}/__qa/commit-next-batch-audit-then-fail`);
  const committedLostResponseBefore = await page.request.get(`${base}/__qa/batch-audit-state`).then((response) => response.json());
  await batchAuditToolbar.getByRole('button', { name: '通过', exact: true }).click();
  await page.getByText('批量审核成功', { exact: true }).waitFor();
  const committedLostResponseAfter = await page.request.get(`${base}/__qa/batch-audit-state`).then((response) => response.json());
  assert.equal(committedLostResponseAfter.status, 'approved', 'read-back confirms a batch approval committed before its response was lost');
  assert.equal(committedLostResponseAfter.batchAuditAttempts - committedLostResponseBefore.batchAuditAttempts, 1, 'a committed batch approval with a lost response is not resent');
  assert.equal(committedLostResponseAfter.batchAuditWrites - committedLostResponseBefore.batchAuditWrites, 1, 'the ambiguous batch approval writes exactly once');
  assert.equal(await page.getByText('已选 1 个选题', { exact: true }).count(), 0, 'read-back confirmed approval clears the successful selection');

  await page.request.post(`${base}/__qa/reset-batch-audit`);
  await page.reload();
  await page.getByRole('table').getByText('待审核', { exact: true }).waitFor();
  await page.getByRole('button', { name: `选择选题：${topic.title}`, exact: true }).click();
  const uncertainBatchAuditToolbar = page.getByText('已选 1 个选题', { exact: true }).locator('..');
  await page.request.post(`${base}/__qa/fail-next-batch-audit-and-read`);
  const uncertainAuditBefore = await page.request.get(`${base}/__qa/batch-audit-state`).then((response) => response.json());
  await uncertainBatchAuditToolbar.getByRole('button', { name: '通过', exact: true }).click();
  const statusVerificationBanner = page.getByRole('alert').filter({ hasText: '审核或状态更新结果暂时无法确认' });
  await statusVerificationBanner.waitFor();
  const lockedBatchApprove = uncertainBatchAuditToolbar.getByRole('button', { name: '通过', exact: true });
  assert.equal(await lockedBatchApprove.isDisabled(), true, 'an unreadable audit result locks a repeated batch approval');
  const unknownAuditState = await page.request.get(`${base}/__qa/batch-audit-state`).then((response) => response.json());
  assert.equal(unknownAuditState.batchAuditAttempts - uncertainAuditBefore.batchAuditAttempts, 1, 'an unreadable batch audit result does not trigger an automatic second POST');
  assert.equal(unknownAuditState.status, 'pending', 'the failed first audit leaves the fixture in its original state');
  await statusVerificationBanner.getByRole('button', { name: '只读核实', exact: true }).click();
  await page.getByText('只读核实完成', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').filter({ hasText: '审核或状态更新结果暂时无法确认' }).count(), 0, 'a successful read-only check releases the status-write lock');
  assert.equal(await lockedBatchApprove.isDisabled(), false, 'the unchanged server state permits a deliberate user retry');
  const afterReadOnlyVerification = await page.request.get(`${base}/__qa/batch-audit-state`).then((response) => response.json());
  assert.equal(afterReadOnlyVerification.batchAuditAttempts, unknownAuditState.batchAuditAttempts, 'read-only verification sends no audit request');
  await lockedBatchApprove.click();
  await page.getByText('批量审核成功', { exact: true }).waitFor();
  const afterExplicitRetry = await page.request.get(`${base}/__qa/batch-audit-state`).then((response) => response.json());
  assert.equal(afterExplicitRetry.status, 'approved', 'the explicit retry applies after the original state is verified');
  assert.equal(afterExplicitRetry.batchAuditAttempts - afterReadOnlyVerification.batchAuditAttempts, 1, 'only the deliberate retry adds an audit request');
  assert.equal(afterExplicitRetry.batchAuditWrites - afterReadOnlyVerification.batchAuditWrites, 1, 'the deliberate retry writes exactly once');

  await page.getByRole('button', { name: `删除选题 ${topic.title}` }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  failNextTopicDelete = true;
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除失败', { exact: true }).waitFor();
  assert.equal(topicExists, true, 'failed topic deletion leaves the isolated topic intact');
  assert.equal(await page.getByRole('heading', { name: '确认删除', exact: true }).count(), 1, 'failed topic deletion keeps its confirmation open for retry');
  const deletesBeforeRetry = await page.request.get(`${base}/__qa/topic-delete-state`).then((response) => response.json()).then((state) => state.topicDeleteRequestCount);
  await page.request.post(`${base}/__qa/delay-next-topic-delete`);
  await page.evaluate(() => {
    const confirmButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === '确认删除');
    if (!confirmButton) throw new Error('找不到选题删除确认按钮');
    confirmButton.click();
    confirmButton.click();
  });
  await page.waitForFunction(async () => (await (await fetch('/__qa/topic-delete-state')).json()).topicDeleteStarted);
  const deletesWhileHeld = await page.request.get(`${base}/__qa/topic-delete-state`).then((response) => response.json()).then((state) => state.topicDeleteRequestCount);
  assert.equal(deletesWhileHeld - deletesBeforeRetry, 1, 'same-task double confirmation starts only one topic DELETE');
  await page.request.post(`${base}/__qa/release-topic-delete`);
  await page.getByText('删除成功', { exact: true }).waitFor();
  const deletesAfterRetry = await page.request.get(`${base}/__qa/topic-delete-state`).then((response) => response.json()).then((state) => state.topicDeleteRequestCount);
  assert.equal(deletesAfterRetry - deletesBeforeRetry, 1, 'retry after a confirmed failure sends exactly one additional DELETE');
  assert.equal(topicExists, false, 'successful topic deletion removes the isolated topic');
  assert.equal(await page.getByRole('button', { name: topic.title, exact: true }).count(), 0, 'successful topic deletion removes its row from the list');

  await page.request.post(`${base}/__qa/restore-topic`);
  await page.reload();
  await page.getByRole('button', { name: `删除选题 ${topic.title}` }).waitFor();
  await page.request.post(`${base}/__qa/commit-next-topic-delete-then-fail`);
  const deletesBeforeLostResponse = await page.request.get(`${base}/__qa/topic-delete-state`).then((response) => response.json()).then((state) => state.topicDeleteRequestCount);
  await page.getByRole('button', { name: `删除选题 ${topic.title}` }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(topicExists, false, 'read-back confirms deletion when the server committed but its response was lost');
  const deletesAfterLostResponse = await page.request.get(`${base}/__qa/topic-delete-state`).then((response) => response.json()).then((state) => state.topicDeleteRequestCount);
  assert.equal(deletesAfterLostResponse - deletesBeforeLostResponse, 1, 'a committed deletion with a lost response is never resent');

  await page.request.post(`${base}/__qa/restore-topic`);
  await page.reload();
  await page.getByRole('button', { name: `删除选题 ${topic.title}` }).waitFor();
  await page.request.post(`${base}/__qa/fail-next-topic-detail-read`);
  failNextTopicDelete = true;
  await page.getByRole('button', { name: `删除选题 ${topic.title}` }).click();
  const confirmButton = page.getByRole('button', { name: '确认删除', exact: true });
  await confirmButton.click();
  await page.getByText('删除结果待核实', { exact: true }).waitFor();
  assert.equal(await confirmButton.isDisabled(), true, 'uncertain deletion disables confirmation until read-only verification');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const topicDeleteBanner = page.getByRole('alert').filter({ hasText: '删除结果暂时无法确认' });
  await topicDeleteBanner.waitFor();
  await page.getByRole('button', { name: `删除选题 ${topic.title}` }).isDisabled().then((disabled) => assert.equal(disabled, true, 'uncertain record cannot be deleted again from the row'));
  await topicDeleteBanner.getByRole('button', { name: '只读核实', exact: true }).click();
  await page.getByText('只读核实完成', { exact: true }).waitFor();
  assert.equal(topicExists, true, 'read-only verification confirms the topic remains present after the failed deletion');
  await page.getByRole('button', { name: `删除选题 ${topic.title}` }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(topicExists, false, 'a deliberate retry succeeds after read-back confirms the topic still exists');
  await page.getByRole('heading', { name: '暂无选题', level: 2 }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '暂无选题', level: 3 }).count(), 0, 'the empty topic-list title follows the page heading hierarchy');

  await page.screenshot({ path: '/tmp/xmt-topics-list-responsive-1366.png', fullPage: true });
  assert.deepEqual(errors, [], 'Topics list should render without browser errors');
  assert.equal(expectedHttpErrors.length, 25, 'the isolated mutation recovery scenarios plus desktop/mobile initial and same-page detail recovery return twenty-three intentional 503s and two confirmed missing-topic 404s');
  await context.close();
  await darkContext.close();
  console.log('Topics list responsive browser test passed: topic board transition locking at desktop/mobile widths, sticky actions, and desktop zoom matrix.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
