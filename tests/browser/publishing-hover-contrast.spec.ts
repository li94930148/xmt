import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Locator } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 96, username: 'publishing-contrast-qa', role: 'admin', name: '发布对比度验收', enabled: true, force_change_password: false };
const publishing = {
  id: 961,
  topic_id: 962,
  platform: '抖音',
  url: 'https://example.invalid/qa',
  status: 'published',
  publish_time: '2026-10-07 09:00:00',
  operator_id: user.id,
  operator_name: user.name,
  topic_title: '发布列表主题对比度验收',
  views: 1234,
  likes: 12,
  shares: 3,
  comments: 4,
  views_source: 'douyin_official_export',
  likes_source: 'manual',
  shares_source: 'unavailable',
  comments_source: 'douyin_creator_collection',
  douyin_work_id: 963,
  douyin_title: '发布列表作品标题验收',
  data_source: 'douyin',
  created_at: '2026-10-07 09:00:00',
  updated_at: '2026-10-07 09:00:00',
};
const createdPublishing = {
  ...publishing,
  id: 964,
  platform: '视频号',
  status: 'pending',
  publish_time: '',
  topic_title: '发布记录创建刷新反馈验收',
  data_source: 'publishing',
  douyin_work_id: null,
  douyin_title: null,
};
let publishingExists = true;
let createdPublishingExists = false;
let failNextPublishingDelete = false;
let delayNextPublishingDelete = false;
let delayNextDouyinReconcile = false;
let delayNextDouyinLink = false;
let failNextPublishingListRead = false;
let delayNextPublishingCreate = false;
let publishingDeleteRequests = 0;
let publishingCreateRequests = 0;
let publishingListRequests = 0;
let douyinReconcileRequests = 0;
let douyinLinkRequests = 0;
let currentDouyinWorkId: number | null = 963;

function luminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

async function contrast(locator: Locator) {
  return locator.evaluate((element) => {
    const foreground = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    const row = element.closest('tr');
    const background = (row ? getComputedStyle(row).backgroundColor : getComputedStyle(element.parentElement || element).backgroundColor).match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
    return { foreground, background, backgroundColor: row ? getComputedStyle(row).backgroundColor : getComputedStyle(element.parentElement || element).backgroundColor };
  }).then(({ foreground, background, backgroundColor }) => {
    if (foreground.length !== 3 || background.length !== 3) return { ratio: 0, backgroundColor };
    const weights = [0.2126, 0.7152, 0.0722];
    const textLum = foreground.reduce((sum, channel, index) => sum + weights[index] * luminance(channel), 0);
    const backgroundLum = background.reduce((sum, channel, index) => sum + weights[index] * luminance(channel), 0);
    return { ratio: (Math.max(textLum, backgroundLum) + 0.05) / (Math.min(textLum, backgroundLum) + 0.05), backgroundColor };
  });
}

const app = express();
app.use(express.json());
app.get('/__qa/state', (_req, res) => res.json({ publishingExists, createdPublishingExists, publishingDeleteRequests, publishingCreateRequests, publishingListRequests, douyinReconcileRequests, douyinLinkRequests, currentDouyinWorkId }));
app.post('/__qa/fail-next-list-read', (_req, res) => {
  failNextPublishingListRead = true;
  return res.json({ ok: true });
});
app.post('/__qa/reset', (_req, res) => {
  publishingExists = true;
  createdPublishingExists = false;
  failNextPublishingDelete = false;
  delayNextPublishingDelete = false;
  delayNextDouyinReconcile = false;
  delayNextDouyinLink = false;
  failNextPublishingListRead = false;
  delayNextPublishingCreate = false;
  douyinReconcileRequests = 0;
  douyinLinkRequests = 0;
  currentDouyinWorkId = 963;
  return res.json({ ok: true });
});
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'dark' ? 'dark' : 'light';
  return res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','publishing-contrast-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/publishing');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['*']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/workflow/publishing', (_req, res) => {
  publishingListRequests += 1;
  if (failNextPublishingListRead) {
    failNextPublishingListRead = false;
    return res.status(503).json({ message: '模拟列表刷新失败' });
  }
  const records = [
    ...(publishingExists ? [{ ...publishing, douyin_work_id: currentDouyinWorkId }] : []),
    ...(createdPublishingExists ? [createdPublishing] : []),
  ];
  return res.json({ data: records, page: 1, limit: 50, total: records.length, summary: { today: 0, pending: createdPublishingExists ? 1 : 0, published: publishingExists ? 1 : 0, failed: 0 } });
});
app.post('/api/workflow/publishing/douyin/reconcile', (_req, res) => {
  douyinReconcileRequests += 1;
  const sendConfirmed = () => res.json({ message: '抖音关联已刷新', linked: 1, reviewed: 1, ambiguous: 0, unmatched: 0 });
  if (delayNextDouyinReconcile) {
    delayNextDouyinReconcile = false;
    setTimeout(sendConfirmed, 300);
    return;
  }
  return sendConfirmed();
});
app.get('/api/workflow/publishing/:id/douyin-candidates', (_req, res) => res.json({
  publishing: { id: publishing.id, title: publishing.topic_title },
  candidates: [{ id: 965, title: '人工关联作品候选', publish_time: '2026-10-07 09:00:00', play_count: 1200, like_count: 30, match_score: 0.95, match_method: 'exact', linked_publishing_id: null }],
}));
app.put('/api/workflow/publishing/:id/douyin-link', (req, res) => {
  douyinLinkRequests += 1;
  currentDouyinWorkId = req.body.douyin_work_id ?? null;
  const sendConfirmed = () => res.json({ message: currentDouyinWorkId === null ? '已解除关联' : '已关联抖音作品' });
  if (delayNextDouyinLink) {
    delayNextDouyinLink = false;
    setTimeout(sendConfirmed, 300);
    return;
  }
  return sendConfirmed();
});
app.post('/api/workflow/publishing', (_req, res) => {
  publishingCreateRequests += 1;
  createdPublishingExists = true;
  const sendConfirmed = () => res.status(201).json({ message: '发布记录已添加', publishingId: createdPublishing.id });
  if (delayNextPublishingCreate) {
    delayNextPublishingCreate = false;
    setTimeout(sendConfirmed, 300);
    return;
  }
  return sendConfirmed();
});
app.delete('/api/workflow/publishing/:id', (_req, res) => {
  publishingDeleteRequests += 1;
  if (failNextPublishingDelete) {
    failNextPublishingDelete = false;
    return res.status(503).json({ message: '模拟删除失败' });
  }
  publishingExists = false;
  const sendConfirmed = () => res.json({ message: '发布记录已删除' });
  if (delayNextPublishingDelete) {
    delayNextPublishingDelete = false;
    setTimeout(sendConfirmed, 300);
    return;
  }
  return sendConfirmed();
});
app.get('/api/topics', (_req, res) => res.json({ data: [{ id: 962, title: '发布记录反馈验收选题', status: 'publishing' }], page: 1, limit: 20, total: 1 }));
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_PUBLISHING_CONTRAST_QA_SERVE === '1') {
  console.log(`Isolated publishing contrast QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  for (const theme of ['light', 'dark'] as const) {
    await page.goto(`${base}/__qa?theme=${theme}`);
    await page.getByRole('heading', { name: '发布管理' }).waitFor();
    const row = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
    await row.waitFor();
    const title = row.locator('td').first().locator('span.line-clamp-2');
    await title.hover();
    for (const [label, locator] of [
      ['发布标题悬停', title],
      ['抖音作品副标题', row.locator('td').first().locator('span.text-xs.text-studio-cyan-contrast')],
      ['播放量指标文字', row.locator('[title^="播放量"]')],
      ['播放量来源小字', row.locator('[title^="播放量"] > span')],
    ] as const) {
      const result = await contrast(locator);
      assert.ok(result.ratio >= 4.5, `${theme} 发布管理${label}对比度为 ${result.ratio.toFixed(2)}:1 on ${result.backgroundColor}，应不低于 4.5:1`);
    }
    for (const [label, locator] of [
      ['点赞指标文字', row.locator('[title^="点赞量"]')],
      ['点赞来源小字', row.locator('[title^="点赞量"] > span')],
      ['分享指标文字', row.locator('[title^="分享量"]')],
      ['分享来源小字', row.locator('[title^="分享量"] > span')],
      ['评论指标文字', row.locator('[title^="评论量"]')],
      ['评论来源小字', row.locator('[title^="评论量"] > span')],
    ] as const) {
      const result = await contrast(locator);
      assert.ok(result.ratio >= 4.5, `${theme} 发布管理${label}对比度为 ${result.ratio.toFixed(2)}:1 on ${result.backgroundColor}，应不低于 4.5:1`);
    }
    await page.screenshot({ path: `/tmp/xmt-publishing-metrics-${theme}.png` });
  }

  await page.goto(`${base}/__qa?theme=light`);
  await page.setViewportSize({ width: 390, height: 844 });
  const publishingSearch = page.getByRole('textbox', { name: '搜索发布记录' });
  assert.equal(await publishingSearch.getAttribute('id'), 'publishing-search', 'the publishing list search has a stable id and accessible name');
  await page.setViewportSize({ width: 320, height: 844 });
  const narrowPublishingRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await narrowPublishingRow.scrollIntoViewIfNeeded();
  const narrowPublishingActionCell = narrowPublishingRow.locator('td').last();
  const narrowPublishingActions = await narrowPublishingActionCell.evaluate((cell) => {
    const button = cell.querySelector('button[aria-label^="删除发布记录"]');
    const rect = button?.getBoundingClientRect();
    const table = cell.closest('table');
    const scrollport = table?.parentElement;
      const scrollportRect = scrollport?.getBoundingClientRect();
      const actionCellRect = cell.getBoundingClientRect();
      const title = table?.querySelector('tbody tr td:first-child span.line-clamp-2');
      const titleRect = title?.getBoundingClientRect();
      const visibleTitleRight = Math.min(titleRect?.right ?? -1, actionCellRect.left, scrollportRect?.right ?? -1);
    return {
      position: getComputedStyle(cell).position,
      scrollWidth: scrollport?.scrollWidth ?? 0,
      clientWidth: scrollport?.clientWidth ?? 0,
      buttonLeft: rect?.left ?? -1,
      buttonRight: rect?.right ?? -1,
      buttonTop: rect?.top ?? -1,
      buttonBottom: rect?.bottom ?? -1,
        visibleTitleWidth: titleRect && scrollportRect ? visibleTitleRight - Math.max(titleRect.left, scrollportRect.left) : 0,
    };
  });
  assert.equal(narrowPublishingActions.position, 'sticky', 'publishing actions stay fixed to the right edge of the horizontal scrollport');
  assert.ok(narrowPublishingActions.scrollWidth > narrowPublishingActions.clientWidth, 'the publication list retains horizontal scrolling for secondary fields');
  assert.ok(narrowPublishingActions.buttonLeft >= 0 && narrowPublishingActions.buttonRight <= 320, `the delete action stays reachable at 320px: ${JSON.stringify(narrowPublishingActions)}`);
  assert.ok(narrowPublishingActions.buttonTop >= 0 && narrowPublishingActions.buttonBottom <= 844, `the delete action is fully visible when its row is in view: ${JSON.stringify(narrowPublishingActions)}`);
  assert.ok(narrowPublishingActions.visibleTitleWidth >= 110, `the sticky action controls leave enough room to read the topic title: ${JSON.stringify(narrowPublishingActions)}`);
  assert.equal(await narrowPublishingRow.getByRole('button', { name: `删除发布记录 ${publishing.topic_title}` }).isVisible(), true, 'row actions expose a descriptive accessible name');
  await page.screenshot({ path: '/tmp/xmt-publishing-list-actions-light-320.png' });
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto(`${base}/__qa?theme=dark`);
  await page.getByRole('heading', { name: '发布管理' }).waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.setViewportSize({ width: 320, height: 844 });
  const darkNarrowPublishingRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await darkNarrowPublishingRow.scrollIntoViewIfNeeded();
  const darkStickySurface = await darkNarrowPublishingRow.locator('td').last().evaluate((cell) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--xmt-surface)';
    document.body.append(probe);
    const tokenSurface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { actual: getComputedStyle(cell).backgroundColor, token: tokenSurface, position: getComputedStyle(cell).position };
  });
  assert.equal(darkStickySurface.actual, darkStickySurface.token, 'the dark sticky action surface follows the current Studio surface token');
  assert.equal(darkStickySurface.position, 'sticky', 'the dark mobile action column remains fixed');
  assert.ok(await darkNarrowPublishingRow.getByRole('button', { name: `删除发布记录 ${publishing.topic_title}` }).isVisible(), 'the dark theme keeps the row action visible');
  await page.screenshot({ path: '/tmp/xmt-publishing-list-actions-dark-320.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const refreshFailureRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await refreshFailureRow.getByRole('button', { name: '删除' }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  const deleteRequestsBeforeRefreshFailure = publishingDeleteRequests;
  delayNextPublishingDelete = true;
  failNextPublishingListRead = true;
  const deleteResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}`));
  await page.getByRole('button', { name: '确认删除', exact: true }).dblclick();
  const pendingDeleteButton = page.getByRole('button', { name: '处理中...', exact: true });
  await pendingDeleteButton.waitFor();
  assert.equal(await pendingDeleteButton.isDisabled(), true, 'the delete confirmation cannot be submitted again while its write is pending');
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true, 'the confirmed delete cannot be dismissed while the request is pending');
  await deleteResponse;
  await page.getByText('删除成功', { exact: true }).waitFor();
  const refreshFailureAlert = page.getByRole('alert').filter({ hasText: '服务端已确认发布记录删除' });
  await refreshFailureAlert.waitFor();
  assert.equal(await page.getByText('获取数据失败', { exact: true }).count(), 0, 'a single persistent list alert replaces a duplicate generic toast after the confirmed delete');
  const refreshAlertLayout = await refreshFailureAlert.evaluate((element) => {
    const message = element.querySelector('p');
    const button = element.querySelector('button');
    return {
      direction: getComputedStyle(element).flexDirection,
      messageWidth: message?.getBoundingClientRect().width ?? 0,
      messageBottom: message?.getBoundingClientRect().bottom ?? 0,
      buttonTop: button?.getBoundingClientRect().top ?? 0,
    };
  });
  assert.equal(refreshAlertLayout.direction, 'column', 'the 390px feedback alert stacks its action below the message');
  assert.ok(refreshAlertLayout.messageWidth > 280 && refreshAlertLayout.buttonTop >= refreshAlertLayout.messageBottom, `the mobile alert gives the Chinese message a readable line width: ${JSON.stringify(refreshAlertLayout)}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the confirmed-delete refresh alert remains within a 390px viewport');
  assert.equal(publishingExists, false, 'the delete mutation is confirmed before the isolated refresh fails');
  assert.equal(publishingDeleteRequests, deleteRequestsBeforeRefreshFailure + 1, 'rapid confirmation submits exactly one DELETE');
  assert.equal(await refreshFailureRow.count(), 0, 'a confirmed deleted row is removed locally rather than left available for duplicate deletion');
  assert.equal(await page.getByRole('heading', { name: '确认删除', exact: true }).count(), 0, 'a confirmed delete closes its confirmation even when the later list read fails');
  await page.screenshot({ path: '/tmp/xmt-v7-7-publishing-delete-refresh-error.png', fullPage: false });
  const listRequestsBeforeRetry = publishingListRequests;
  await refreshFailureAlert.getByRole('button', { name: '重新加载列表' }).click();
  await page.getByText('暂无发布记录', { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the recovered empty state remains within a 390px viewport');
  await page.screenshot({ path: '/tmp/xmt-v7-7-publishing-delete-refresh-recovered.png', fullPage: false });
  assert.equal(publishingListRequests, listRequestsBeforeRetry + 1, 'list retry performs one GET');
  assert.equal(publishingDeleteRequests, deleteRequestsBeforeRefreshFailure + 1, 'list retry does not repeat the confirmed DELETE');

  publishingExists = true;
  await page.goto(`${base}/__qa?theme=light`);
  const deleteRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await deleteRow.getByRole('button', { name: '删除' }).click();
  await page.getByRole('heading', { name: '确认删除', exact: true }).waitFor();
  failNextPublishingDelete = true;
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除失败', { exact: true }).waitFor();
  assert.equal(publishingExists, true, 'failed publishing deletion leaves the isolated record intact');
  assert.equal(await page.getByRole('heading', { name: '确认删除', exact: true }).count(), 1, 'failed publishing deletion keeps its confirmation open for retry');
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('删除成功', { exact: true }).waitFor();
  assert.equal(publishingExists, false, 'successful publishing deletion removes the isolated record');

  publishingExists = true;
  createdPublishingExists = false;
  await page.goto(`${base}/__qa?theme=light`);
  await page.getByRole('button', { name: '添加发布记录', exact: true }).first().click();
  await page.locator('select').first().selectOption(String(createdPublishing.topic_id));
  const createRequestsBeforeRefreshFailure = publishingCreateRequests;
  delayNextPublishingCreate = true;
  failNextPublishingListRead = true;
  const createSaveButton = page.getByRole('button', { name: '保存', exact: true });
  const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/workflow/publishing'));
  await createSaveButton.dblclick();
  const pendingSaveButton = page.getByRole('button', { name: '提交中...', exact: true });
  await pendingSaveButton.waitFor();
  assert.equal(await pendingSaveButton.isDisabled(), true, 'the publishing save button is disabled while its write is pending');
  assert.equal(await page.getByRole('button', { name: '取消', exact: true }).isDisabled(), true, 'the publishing form cannot be dismissed while its confirmed write is pending');
  assert.equal(await page.locator('select').first().isDisabled(), true, 'publishing fields cannot change while the submitted values are being saved');
  await createResponse;
  await page.getByText('创建成功', { exact: true }).waitFor();
  const createRefreshFailureAlert = page.getByRole('alert').filter({ hasText: '服务端已确认发布记录创建' });
  await createRefreshFailureAlert.waitFor();
  assert.equal(createdPublishingExists, true, 'the isolated create mutation is confirmed before its list read fails');
  assert.equal(publishingCreateRequests, createRequestsBeforeRefreshFailure + 1, 'the create request is submitted exactly once');
  const createListRequestsBeforeRetry = publishingListRequests;
  await createRefreshFailureAlert.getByRole('button', { name: '重新加载列表' }).click();
  await page.getByText(createdPublishing.topic_title, { exact: true }).waitFor();
  assert.equal(publishingListRequests, createListRequestsBeforeRetry + 1, 'creation recovery performs one additional list GET');
  assert.equal(publishingCreateRequests, createRequestsBeforeRefreshFailure + 1, 'creation recovery does not repeat the confirmed POST');

  await page.setViewportSize({ width: 1440, height: 900 });
  failNextPublishingListRead = true;
  const reconcileRequestsBeforeRefreshFailure = douyinReconcileRequests;
  delayNextDouyinReconcile = true;
  const reconcileResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/workflow/publishing/douyin/reconcile'));
  await page.getByRole('button', { name: '刷新抖音关联' }).dblclick();
  const pendingReconcileButton = page.getByRole('button', { name: '正在关联', exact: true });
  await pendingReconcileButton.waitFor();
  assert.equal(await pendingReconcileButton.isDisabled(), true, 'Douyin reconciliation cannot be submitted again while its write is pending');
  await reconcileResponse;
  await page.getByText('抖音数据关联已刷新', { exact: true }).waitFor();
  const reconcileRefreshAlert = page.getByRole('alert').filter({ hasText: '服务端已确认抖音数据关联刷新' });
  await reconcileRefreshAlert.waitFor();
  assert.equal(douyinReconcileRequests, reconcileRequestsBeforeRefreshFailure + 1, 'Douyin reconciliation is confirmed once before list refresh');
  const reconcileListRequestsBeforeRetry = publishingListRequests;
  await reconcileRefreshAlert.getByRole('button', { name: '重新加载列表' }).click();
  await page.locator('tbody tr').filter({ hasText: createdPublishing.topic_title }).waitFor();
  assert.equal(publishingListRequests, reconcileListRequestsBeforeRetry + 1, 'reconciliation recovery performs one read-only list request');
  assert.equal(douyinReconcileRequests, reconcileRequestsBeforeRefreshFailure + 1, 'read-only list recovery does not repeat reconciliation');

  const linkedPublishingRow = page.locator('tbody tr').filter({ hasText: publishing.topic_title });
  await linkedPublishingRow.getByTitle('调整抖音作品关联').click();
  await page.getByRole('heading', { name: '关联抖音作品' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '搜索抖音作品标题关键词' }).getAttribute('id'), 'douyin-candidate-search', 'the Douyin candidate search has a stable id and accessible name');
  await page.getByText('人工关联作品候选', { exact: true }).waitFor();
  failNextPublishingListRead = true;
  delayNextDouyinLink = true;
  const douyinLinkRequestsBeforeRefreshFailure = douyinLinkRequests;
  const douyinLinkResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/workflow/publishing/${publishing.id}/douyin-link`));
  await page.getByRole('button', { name: '关联此作品' }).dblclick();
  assert.equal(await page.getByRole('button', { name: '关闭', exact: true }).isDisabled(), true, 'the Douyin link dialog cannot be dismissed while its write is pending');
  await douyinLinkResponse;
  await page.getByText('关联成功', { exact: true }).waitFor();
  const linkRefreshAlert = page.getByRole('alert').filter({ hasText: '服务端已确认抖音作品关联，但发布列表刷新失败' });
  await linkRefreshAlert.waitFor();
  assert.equal(currentDouyinWorkId, 965, 'the isolated manual Douyin link is persisted before list refresh');
  assert.equal(douyinLinkRequests, douyinLinkRequestsBeforeRefreshFailure + 1, 'manual Douyin linking is confirmed once');
  const linkListRequestsBeforeRetry = publishingListRequests;
  await linkRefreshAlert.getByRole('button', { name: '重新加载列表' }).click();
  await page.locator('tbody tr').filter({ hasText: publishing.topic_title }).waitFor();
  assert.equal(publishingListRequests, linkListRequestsBeforeRetry + 1, 'manual-link recovery performs one read-only list request');
  assert.equal(douyinLinkRequests, douyinLinkRequestsBeforeRefreshFailure + 1, 'read-only list recovery does not repeat manual linking');

  assert.deepEqual(errors, [], 'publishing light/dark contrast fixture renders without browser errors');
  assert.equal(expectedHttpErrors.length, 5, 'the isolated fixture returns intentional delete, create, reconciliation, and manual-link list-read 503 responses');
  console.log('Publishing browser test passed: title and metric source contrast maintain 4.5:1 in light/dark themes; confirmed create/delete, Douyin reconciliation, and manual-link operations distinguish writes from failed list reads and retry only GET.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
