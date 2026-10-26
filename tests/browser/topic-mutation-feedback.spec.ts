import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const screenshotDir = '/tmp/xmt-topic-mutation-feedback';
const app = express();
app.use(express.json());

const user = {
  id: 1,
  username: 'topic-feedback-admin',
  email: 'topic-feedback@example.invalid',
  role: 'admin',
  name: '反馈验收管理员',
  enabled: true,
  force_change_password: false,
};

type FixtureTopic = {
  id: number;
  title: string;
  description: string;
  outline: string;
  status: 'pending' | 'approved' | 'rejected' | 'shooting' | 'publishing';
  creator_id: number;
  creator_name: string;
  assignee_id: number | null;
  assignee_name: string | null;
  platform: string;
  deadline: string;
  submitted_at: string;
  created_at: string;
  history: Array<Record<string, unknown>>;
};

const makeTopic = (id: number, title: string, status: FixtureTopic['status'] = 'pending'): FixtureTopic => ({
  id,
  title,
  description: '用于隔离验收的选题描述。',
  outline: '<p>验收大纲</p>',
  status,
  creator_id: user.id,
  creator_name: user.name,
  assignee_id: 0,
  assignee_name: null,
  platform: '抖音',
  deadline: '2026-10-01',
  submitted_at: '2026-09-28T00:00:00.000Z',
  created_at: '2026-09-28T00:00:00.000Z',
  history: [],
});

let topics = [makeTopic(1, '部分审核成功主题'), makeTopic(2, '审核与删除需重试主题'), makeTopic(3, '刷新失败仍已审核主题')];
const auditFailures = new Set([2]);
const deleteFailures = new Set([2]);
const detailReads = new Map<number, number>();
const topicDimensions = new Map<number, Array<{ id: number; type: string; value: string }>>();
let nextDimensionId = 101;
let dimensionAddRequests = 0;
let dimensionAddGate: Promise<void> = Promise.resolve();
let releaseDimensionAdd: (() => void) | null = null;
let dimensionAddStarted: Promise<void> = Promise.resolve();
let markDimensionAddStarted: (() => void) | null = null;
const expectedFixtureFailures = new Set<string>();

function holdDimensionAdd() {
  dimensionAddGate = new Promise<void>((resolve) => { releaseDimensionAdd = resolve; });
  dimensionAddStarted = new Promise<void>((resolve) => { markDimensionAddStarted = resolve; });
}

app.use('/api', async (request, response) => {
  if (request.path === '/auth/me') return response.json(user);
  if (request.path === '/messages/unread') return response.json({ unreadCount: 0 });
  if (request.path === '/system-settings' || request.path === '/system-settings/public') return response.json({});
  if (request.path === '/users') return response.json({ data: [], total: 0, page: 1, limit: 50 });
  if (request.path === '/topics' && request.method === 'GET') return response.json({ data: topics, total: topics.length, page: 1, limit: 15 });
  if (request.path === '/resource-center/content-topics' && request.method === 'GET') {
    const dimensions = topicDimensions.get(3) ?? [];
    const data = [{ id: 3, title: '城市资产重复提交验收', status: 'pending', platform: '抖音', created_at: '2026-09-28T00:00:00.000Z', updated_at: '2026-09-28T00:00:00.000Z', production_count: 0, latest_production_id: null, latest_production_version: null, latest_production_updated_at: null, shooting_count: 0, publishing_count: 0, resource_count: 0, linked_resources: [], referenced_resources: [], dimensions, can_manage_dimensions: true, latest_analytics: null }];
    const registeredTopicCounts = Object.fromEntries((['city', 'person', 'project'] as const).map((type) => [type, dimensions.some((dimension) => dimension.type === type) ? 1 : 0]));
    return response.json({ data, pagination: { page: 1, page_size: 12, total: 1, total_pages: 1 }, analytics_visible: false, available_dimensions: [], dimension_summaries: [], dimension_coverage: { visible_topics_total: 1, registered_topic_counts: registeredTopicCounts } });
  }

  const dimensionsMatch = request.path.match(/^\/topics\/(\d+)\/asset-dimensions$/);
  if (dimensionsMatch && request.method === 'GET') return response.json({ data: topicDimensions.get(Number(dimensionsMatch[1])) ?? [] });
  if (dimensionsMatch && request.method === 'POST') {
    dimensionAddRequests += 1;
    markDimensionAddStarted?.();
    const currentGate = dimensionAddGate;
    await currentGate;
    const topicId = Number(dimensionsMatch[1]);
    const type = String(request.body.type);
    const value = String(request.body.value).trim();
    const existing = topicDimensions.get(topicId) ?? [];
    if (existing.some((item) => item.type === type && item.value.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      return response.status(409).json({ message: '该选题已登记此维度' });
    }
    const dimension = { id: nextDimensionId++, type, value };
    topicDimensions.set(topicId, [...existing, dimension]);
    return response.status(201).json({ message: '维度已登记', id: dimension.id, data: dimension });
  }

  const auditMatch = request.path.match(/^\/topics\/(\d+)\/audit$/);
  if (auditMatch && request.method === 'POST') {
    const topicId = Number(auditMatch[1]);
    if (auditFailures.has(topicId)) {
      auditFailures.delete(topicId);
      expectedFixtureFailures.add(`POST /api/topics/${topicId}/audit`);
      return response.status(503).json({ message: '审核服务暂不可用，请重试' });
    }
    topics = topics.map((topic) => topic.id === topicId ? { ...topic, status: request.body.status } : topic);
    return response.json({ success: true, message: '审核已保存' });
  }

  const topicMatch = request.path.match(/^\/topics\/(\d+)$/);
  if (topicMatch && request.method === 'DELETE') {
    const topicId = Number(topicMatch[1]);
    if (deleteFailures.has(topicId)) {
      deleteFailures.delete(topicId);
      expectedFixtureFailures.add(`DELETE /api/topics/${topicId}`);
      return response.status(503).json({ message: '删除服务暂不可用，请重试' });
    }
    topics = topics.filter((topic) => topic.id !== topicId);
    return response.json({ success: true, message: '已删除' });
  }
  if (topicMatch && request.method === 'PUT') {
    const topicId = Number(topicMatch[1]);
    topics = topics.map((topic) => topic.id === topicId ? { ...topic, ...request.body } : topic);
    return response.json({ success: true, message: '已保存' });
  }
  if (topicMatch && request.method === 'GET') {
    const topicId = Number(topicMatch[1]);
    const reads = (detailReads.get(topicId) ?? 0) + 1;
    detailReads.set(topicId, reads);
    if (topicId === 3 && reads > 1) {
      expectedFixtureFailures.add(`GET /api/topics/${topicId}`);
      return response.status(503).json({ message: '选题详情刷新失败' });
    }
    const topic = topics.find((item) => item.id === topicId);
    return topic ? response.json({ data: topic }) : response.status(404).json({ message: '选题不存在' });
  }
  if (/^\/topics\/\d+\/resources$/.test(request.path)) return response.json({ data: [] });
  if (/^\/topics\/\d+\/versions$/.test(request.path)) return response.json({ data: [] });
  return response.status(404).json({ message: `No fixture for ${request.method} ${request.path}` });
});
app.use('/socket.io', (request, response) => {
  if (request.method === 'GET') return response.type('text/plain').send('0{"sid":"topic-feedback-socket","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
  return response.type('text/plain').send('ok');
});

const server = http.createServer(app);
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ user }) => {
  localStorage.setItem('xmt_user', JSON.stringify(user));
  localStorage.setItem('xmt_token', 'isolated-topic-feedback-token');
  localStorage.setItem('xmt_last_version_seen', '3.3.44');
}, { user });
const page = await context.newPage();
const errors: string[] = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('server responded with a status of 503')) {
    errors.push(message.text());
  }
});
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => {
  if (response.status() < 400) return;
  const request = response.request();
  const route = `${request.method()} ${new URL(response.url()).pathname}`;
  if (expectedFixtureFailures.has(route)) {
    expectedFixtureFailures.delete(route);
    return;
  }
  errors.push(`Unexpected HTTP ${response.status()} ${route}`);
});

async function open(pathname: string) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading').first().waitFor({ state: 'visible', timeout: 15_000 });
}

try {
  await open('/topics');
  await page.getByRole('heading', { name: '选题管理', exact: true }).waitFor();
  assert.equal(await page.title(), '新媒体协作管理系统');

  await page.getByRole('button', { name: '选择选题：部分审核成功主题' }).click();
  await page.getByRole('button', { name: '选择选题：审核与删除需重试主题' }).click();
  await page.getByRole('button', { name: '通过', exact: true }).click();
  await page.getByText('批量审核部分完成', { exact: true }).waitFor();
  await page.getByText('已通过 1 个选题，1 个失败。失败的 1 个选题已保留选择，可重试。首个失败原因：审核服务暂不可用，请重试', { exact: true }).waitFor();
  await page.getByText('已选 1 个选题', { exact: true }).waitFor();
  await page.screenshot({ path: `${screenshotDir}-partial-audit.png`, fullPage: false });

  await page.getByRole('button', { name: '选择选题：部分审核成功主题' }).click();
  page.once('dialog', (dialog) => { void dialog.accept(); });
  await page.getByRole('button', { name: '删除', exact: true }).last().click();
  await page.getByText('批量删除部分完成', { exact: true }).waitFor();
  await page.getByText('已删除 1 个选题，1 个失败。失败的 1 个选题已保留选择，可重试。首个失败原因：删除服务暂不可用，请重试', { exact: true }).waitFor();
  await page.getByText('已选 1 个选题', { exact: true }).waitFor();

  page.once('dialog', (dialog) => { void dialog.accept(); });
  await page.getByRole('button', { name: '删除', exact: true }).last().click();
  await page.getByText('批量删除成功', { exact: true }).waitFor();
  await page.getByText('已删除 1 个选题。', { exact: true }).waitFor();
  await page.getByRole('heading', { name: '选题管理', exact: true }).waitFor();
  await page.screenshot({ path: `${screenshotDir}-delete-retry-success.png`, fullPage: false });

  await open('/topics/3');
  await page.getByText('刷新失败仍已审核主题', { exact: true }).waitFor();
  await page.getByRole('button', { name: '审核选题', exact: true }).click();
  await page.getByRole('heading', { name: '审核选题', exact: true }).waitFor();
  await page.getByRole('button', { name: '通过审核', exact: true }).click();
  await page.getByText('审核已提交', { exact: true }).waitFor();
  await page.getByText('审核操作已成功提交，但详情暂时未能刷新；请稍后手动刷新确认最新信息。', { exact: true }).waitFor();
  await page.getByText('已通过', { exact: true }).waitFor();
  await page.screenshot({ path: `${screenshotDir}-audit-saved-refresh-failed.png`, fullPage: false });

  await page.getByRole('button', { name: '编辑选题', exact: true }).click();
  await page.locator('input[type="text"]').first().fill('已提交保存但刷新失败的主题');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('选题信息已保存', { exact: true }).waitFor();
  await page.getByText('服务端已确认保存，但页面刷新失败；当前内容已保留，请稍后重新加载确认，不要重复保存。', { exact: true }).waitFor();
  await page.getByRole('heading', { name: '已提交保存但刷新失败的主题', exact: true }).waitFor();
  await page.screenshot({ path: `${screenshotDir}-edit-saved-refresh-failed.png`, fullPage: false });

  holdDimensionAdd();
  await page.getByLabel('维度名称-3').fill('杭州');
  await page.evaluate(() => {
    const form = document.getElementById('topic-dimension-value-3')?.closest('form');
    if (!(form instanceof HTMLFormElement)) throw new Error('topic dimension form was not found');
    form.requestSubmit();
    form.requestSubmit();
  });
  await dimensionAddStarted;
  await page.waitForTimeout(100);
  const topicDetailDimensionRequestsWhilePending = dimensionAddRequests;
  releaseDimensionAdd?.();
  await page.getByRole('status').getByText('城市“杭州”已登记。', { exact: true }).waitFor();
  assert.equal(topicDetailDimensionRequestsWhilePending, 1, 'same-event duplicate form submissions from topic detail issue one write');

  holdDimensionAdd();
  await page.goto(`${baseUrl}/asset-center/content-topics`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '主题内容资产', exact: true }).waitFor();
  await page.getByLabel('维度名称-3').fill('李明');
  await page.evaluate(() => {
    const form = document.getElementById('dimension-value-3')?.closest('form');
    if (!(form instanceof HTMLFormElement)) throw new Error('content asset dimension form was not found');
    form.requestSubmit();
    form.requestSubmit();
  });
  await dimensionAddStarted;
  await page.waitForTimeout(100);
  const contentAssetsDimensionRequestsWhilePending = dimensionAddRequests - topicDetailDimensionRequestsWhilePending;
  releaseDimensionAdd?.();
  await page.getByRole('status').getByText('人物“李明”已登记。', { exact: true }).waitFor();
  assert.equal(contentAssetsDimensionRequestsWhilePending, 1, 'same-event duplicate form submissions from content assets issue one write');
  assert.equal(dimensionAddRequests, 2, 'both entry points each submit once');

  assert.equal(await page.getByText('页面出错了', { exact: true }).count(), 0, 'framework error boundary is not visible');
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.equal(await page.evaluate(() => document.body.innerText.trim().length > 0), true, 'application content is rendered');
  console.log(`Topic mutation feedback browser test passed at ${baseUrl}; screenshots: ${screenshotDir}-*.png`);
} finally {
  releaseDimensionAdd?.();
  await context.close();
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
