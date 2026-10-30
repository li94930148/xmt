import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const user = { id: 93, username: 'publishing-recovery-qa', role: 'admin', name: '发布恢复验收', enabled: true, force_change_password: false };
const topic = { id: 930, title: '发布恢复验收选题', status: 'publishing', platform: 'weixin', created_at: '2026-10-28 09:00:00', updated_at: '2026-10-28 09:00:00' };
const record = {
  id: 931,
  topic_id: topic.id,
  platform: 'weixin',
  url: 'https://example.com/original',
  status: 'pending',
  publish_time: '2026-10-29 09:00:00',
  operator_id: user.id,
  operator_name: user.name,
  topic_title: topic.title,
  views: 0,
  likes: 0,
  shares: 0,
  comments: 0,
  manual_views: null,
  manual_likes: null,
  manual_shares: null,
  manual_comments: null,
  data_source: 'publishing',
  created_at: '2026-10-28 09:00:00',
  updated_at: '2026-10-28 09:00:00',
};
let createAttempts = 0;
let updateAttempts = 0;
let deleteAttempts = 0;
let publishingUpdateReadAttempts = 0;
let failNextPublishingUpdateRead = false;
let delayNextPublishingUpdateResponseLoss = false;
let delayedPublishingUpdateResponsePending = false;
let releaseDelayedPublishingUpdateResponse: (() => void) | null = null;

const app = express();
app.use(express.json());
app.get('/__qa-publishing', (_req, res) => res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','publishing-recovery-fixture');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/publishing');</script>`));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({ version }));
app.get('/api/topics', (_req, res) => res.json({ data: [topic], total: 1, page: 1, limit: 20 }));
app.get('/api/workflow/publishing', (_req, res) => res.json({
  data: [{ ...record }], total: 1, page: 1, limit: 50,
  summary: {
    today: 0,
    pending: record.status === 'pending' || record.status === 'scheduled' ? 1 : 0,
    published: record.status === 'published' ? 1 : 0,
    failed: record.status === 'failed' ? 1 : 0,
  },
}));
app.get('/api/workflow/publishing/:id', (req, res) => {
  if (Number(req.params.id) !== record.id) return res.status(404).json({ message: '记录不存在' });
  publishingUpdateReadAttempts += 1;
  if (failNextPublishingUpdateRead) {
    failNextPublishingUpdateRead = false;
    return res.status(503).json({ message: '隔离验收：状态读回暂时失败' });
  }
  return res.json(record);
});
app.get('/__qa-publishing-update-state', (_req, res) => res.json({
  updateAttempts,
  publishingUpdateReadAttempts,
  status: record.status,
  delayedPublishingUpdateResponsePending,
}));
app.post('/__qa-delay-next-publishing-update-response-loss', (_req, res) => {
  delayNextPublishingUpdateResponseLoss = true;
  failNextPublishingUpdateRead = false;
  return res.json({ armed: true });
});
app.post('/__qa-release-delayed-publishing-update-response', (_req, res) => {
  const release = releaseDelayedPublishingUpdateResponse;
  if (!release) return res.status(409).json({ message: '没有等待释放的发布更新响应' });
  releaseDelayedPublishingUpdateResponse = null;
  delayedPublishingUpdateResponsePending = false;
  release();
  return res.json({ released: true });
});
app.post('/api/workflow/publishing', (_req, res) => {
  createAttempts += 1;
  return res.status(201).json({ message: '创建成功', publishingId: 932 });
});
app.put('/api/workflow/publishing/:id', async (req, res) => {
  updateAttempts += 1;
  if (Number(req.params.id) !== record.id) return res.status(404).json({ message: '记录不存在' });
  Object.assign(record, req.body);
  if (delayNextPublishingUpdateResponseLoss) {
    delayNextPublishingUpdateResponseLoss = false;
    failNextPublishingUpdateRead = true;
    delayedPublishingUpdateResponsePending = true;
    await new Promise<void>((resolve) => {
      releaseDelayedPublishingUpdateResponse = resolve;
    });
    return res.status(503).json({ message: '隔离验收：状态已提交但更新响应丢失' });
  }
  return res.json({ message: '更新成功' });
});
app.delete('/api/workflow/publishing/:id', (_req, res) => {
  deleteAttempts += 1;
  return res.json({ message: '删除成功' });
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

if (process.env.XMT_PUBLISHING_RECOVERY_QA_SERVE === '1') {
  console.log(`Isolated publishing recovery QA fixture: ${base}/__qa-publishing`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });

async function suppressMarkerWrite(page: Page, key: string) {
  await page.evaluate((targetKey) => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, '__xmtOriginalPublishingRecoverySetItem', { configurable: true, value: original });
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

async function restoreMarkerWrite(page: Page) {
  await page.evaluate(() => {
    const target = window as Window & { __xmtOriginalPublishingRecoverySetItem?: typeof Storage.prototype.setItem };
    if (target.__xmtOriginalPublishingRecoverySetItem) {
      Object.defineProperty(Storage.prototype, 'setItem', { configurable: true, writable: true, value: target.__xmtOriginalPublishingRecoverySetItem });
      delete target.__xmtOriginalPublishingRecoverySetItem;
    }
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if ((message.type() === 'error' || message.type() === 'warning') && !text.startsWith('You have Reduced Motion enabled on your device.')) errors.push(`${message.type()}: ${text}`);
  });
  await page.goto(`${base}/__qa-publishing`);
  await page.getByRole('heading', { name: '发布管理', exact: true }).waitFor();

  const createKey = 'xmt:publishing-create-pending:v1:user:93';
  await page.getByRole('button', { name: '添加发布记录', exact: true }).click();
  await page.getByLabel('关联选题 *').selectOption(String(topic.id));
  await suppressMarkerWrite(page, createKey);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('浏览器无法保存本次恢复信息，发布记录没有创建。请检查会话存储后重试。', { exact: true }).waitFor();
  assert.equal(createAttempts, 0, 'a publication create is not sent when its recovery marker is silently dropped');
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), createKey), null, 'no create marker was stored');
  assert.equal(await page.getByLabel('关联选题 *').inputValue(), String(topic.id), 'create form values stay available for a manual retry');
  await restoreMarkerWrite(page);
  await page.getByRole('button', { name: '取消', exact: true }).click();

  const updateKey = 'xmt:publishing-update-pending:v1:user:93';
  await page.getByRole('button', { name: `编辑发布记录 ${topic.title}`, exact: true }).click();
  await page.getByLabel('发布链接').fill('https://example.com/updated');
  await suppressMarkerWrite(page, updateKey);
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await page.getByText('浏览器无法保存本次恢复信息；发布记录更新未发送。请检查会话存储后重试。', { exact: true }).waitFor();
  assert.equal(updateAttempts, 0, 'a publication update is not sent when its recovery marker is silently dropped');
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), updateKey), null, 'no update marker was stored');
  assert.equal(await page.getByLabel('发布链接').inputValue(), 'https://example.com/updated', 'update form values stay available for a manual retry');
  await restoreMarkerWrite(page);
  await page.getByRole('button', { name: '取消', exact: true }).click();

  await page.request.post(`${base}/__qa-delay-next-publishing-update-response-loss`);
  await page.getByRole('button', { name: `编辑发布记录 ${topic.title}`, exact: true }).click();
  await page.getByLabel('状态').selectOption('published');
  const ambiguousStatusUpdate = page.waitForResponse((response) => response.request().method() === 'PUT'
    && response.url().endsWith(`/api/workflow/publishing/${record.id}`));
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await page.waitForFunction(async () => {
    const state = await fetch('/__qa-publishing-update-state').then((response) => response.json());
    return state.updateAttempts === 1 && state.delayedPublishingUpdateResponsePending;
  });

  const pendingStatusUpdateMarker = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || 'null'), updateKey);
  assert.equal(pendingStatusUpdateMarker?.payload?.status, 'published', 'the requested status is persisted before the ambiguous PUT is sent');
  assert.equal(pendingStatusUpdateMarker?.original?.status, 'pending', 'the original status is persisted for read-only comparison');
  assert.equal(record.status, 'published', 'the isolated server commits the status before delaying the response');
  assert.equal(updateAttempts, 1, 'the delayed status update has sent exactly one PUT');

  await page.request.post(`${base}/__qa-release-delayed-publishing-update-response`);
  assert.equal((await ambiguousStatusUpdate).status(), 503, 'the committed status update returns an ambiguous lost-response result');
  await page.getByRole('alert').filter({ hasText: '发布记录更新结果尚未确认' }).waitFor();
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), updateKey) !== null, true, 'a failed first read-back keeps the update marker');
  const firstStatusReadState = await page.request.get(`${base}/__qa-publishing-update-state`).then((response) => response.json());
  assert.equal(firstStatusReadState.publishingUpdateReadAttempts, 1, 'the first ambiguous response triggers one read-only GET');
  assert.equal(firstStatusReadState.updateAttempts, 1, 'the failed read-back does not repeat the PUT');

  await page.reload();
  await page.getByRole('heading', { name: '发布管理', exact: true }).waitFor();
  await page.getByText('更新结果已核实', { exact: true }).waitFor();
  const recoveredStatusRow = page.locator('tbody tr').filter({ hasText: topic.title });
  await recoveredStatusRow.getByText('已发布', { exact: true }).waitFor();
  const recoveredStatusState = await page.request.get(`${base}/__qa-publishing-update-state`).then((response) => response.json());
  assert.equal(recoveredStatusState.status, 'published', 'reload read-back reflects the committed status');
  assert.equal(recoveredStatusState.publishingUpdateReadAttempts, 2, 'reload performs one more read-only GET to verify status');
  assert.equal(recoveredStatusState.updateAttempts, 1, 'reload recovery never repeats the committed status PUT');
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), updateKey), null, 'confirmed status recovery clears the pending marker');
  assert.equal(await page.getByRole('button', { name: '只读核实更新状态', exact: true }).count(), 0, 'confirmed status recovery removes the pending verification action');

  const deleteKey = 'xmt:publishing-delete-pending:v1:user:93';
  await page.evaluate((key) => sessionStorage.setItem(key, '{malformed'), deleteKey);
  await page.reload();
  await page.getByRole('alert').filter({ hasText: '格式异常' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '添加发布记录', exact: true }).isDisabled(), true, 'a malformed delete marker locks publication writes instead of being treated as absent');
  await page.evaluate((key) => sessionStorage.removeItem(key), deleteKey);
  await page.getByRole('button', { name: '重试读取恢复信息', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '格式异常' }).waitFor({ state: 'detached' });

  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({ id: record.id, userId: 94, title: topic.title, page: 1 })), deleteKey);
  await page.reload();
  await page.getByRole('alert').filter({ hasText: '与当前账号不匹配' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '添加发布记录', exact: true }).isDisabled(), true, 'a marker owned by another account cannot enable mutation or be verified under the current account');
  await page.evaluate((key) => sessionStorage.removeItem(key), deleteKey);
  await page.getByRole('button', { name: '重试读取恢复信息', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '与当前账号不匹配' }).waitFor({ state: 'detached' });

  await page.getByRole('button', { name: `删除发布记录 ${topic.title}`, exact: true }).click();
  await suppressMarkerWrite(page, deleteKey);
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('浏览器无法保存本次恢复信息；发布记录删除未发送。请检查会话存储后重试。', { exact: true }).waitFor();
  assert.equal(deleteAttempts, 0, 'a publication delete is not sent when its recovery marker is silently dropped');
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), deleteKey), null, 'no delete marker was stored');
  assert.equal(await page.getByRole('heading', { name: '确认删除' }).count(), 1, 'the confirmation stays open so the user can retry or cancel');
  await restoreMarkerWrite(page);

  assert.deepEqual(errors, [], 'the publishing recovery page has no browser errors or warnings');
  console.log('Publishing mutation recovery browser test passed: silent marker drops prevent create, update, and delete; malformed and cross-account delete markers fail closed.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
