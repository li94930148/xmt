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
const expectedFixtureFailures = new Set<string>();

app.use('/api', (request, response) => {
  if (request.path === '/auth/me') return response.json(user);
  if (request.path === '/messages/unread') return response.json({ unreadCount: 0 });
  if (request.path === '/system-settings' || request.path === '/system-settings/public') return response.json({});
  if (request.path === '/users') return response.json({ data: [], total: 0, page: 1, limit: 50 });
  if (request.path === '/topics' && request.method === 'GET') return response.json({ data: topics, total: topics.length, page: 1, limit: 15 });

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
  await page.getByText('保存已提交', { exact: true }).waitFor();
  await page.getByText('选题修改已成功提交，但详情暂时未能刷新；本次修改已保留，请稍后刷新确认最新信息。', { exact: true }).waitFor();
  await page.getByRole('heading', { name: '已提交保存但刷新失败的主题', exact: true }).waitFor();
  await page.screenshot({ path: `${screenshotDir}-edit-saved-refresh-failed.png`, fullPage: false });

  assert.equal(await page.getByText('页面出错了', { exact: true }).count(), 0, 'framework error boundary is not visible');
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.equal(await page.evaluate(() => document.body.innerText.trim().length > 0), true, 'application content is rendered');
  console.log(`Topic mutation feedback browser test passed at ${baseUrl}; screenshots: ${screenshotDir}-*.png`);
} finally {
  await context.close();
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
