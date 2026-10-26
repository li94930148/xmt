import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const admin = { id: 98, username: 'anonymous-feedback-responsive-qa', role: 'admin', name: '匿名意见管理验收', enabled: true, force_change_password: false };
const feedback = {
  id: 981,
  type: 'process',
  content: '验证窄屏下管理操作仍可见。',
  need_reply: true,
  reply_content: null,
  status: 'pending',
  is_public: true,
  created_at: '2026-10-08 09:00:00',
  updated_at: '2026-10-08 09:00:00',
  base_fingerprint: 'a'.repeat(64),
};
let storedFeedback = { ...feedback };
let feedbackPresent = true;
let failNextFeedbackUpdate = false;
let updateOutcome: 'success' | 'fail-before-commit' | 'commit-then-lose-response' = 'success';
let failNextUpdateStatusCode: 401 | 403 | 503 | null = null;
let feedbackBaseVersion = 0;
let failNextFeedbackListGet = false;
let holdNextFeedbackListGet = false;
const heldFeedbackListResponses: Array<() => void> = [];
let feedbackUpdateCount = 0;
let feedbackDeleteCount = 0;
let feedbackListGetCount = 0;
let feedbackListConditionalRequestCount = 0;
let feedbackDeleteStatusGetCount = 0;
const feedbackDeleteRequestIds: string[] = [];
const feedbackDeleteLedger = new Map<string, { actorId: number; targetId: number }>();
let deleteOutcome: 'success' | 'fail-before-commit' | 'commit-then-lose-response' = 'success';
let failNextDeleteStatusCode: 401 | 403 | 503 | null = null;
let invalidateNextDeleteStatus = false;
const feedbackUpdateRequestIds: string[] = [];
const feedbackUpdateRequestBodies: Array<Record<string, unknown>> = [];
const feedbackUpdateLedger = new Map<string, { actorId: number; targetId: number; requestFingerprint: string }>();

function luminance(rgb: number[]) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function contrastRatio(locator: import('playwright').Locator) {
  const colors = await locator.evaluate((element) => {
    const backgrounds: string[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) backgrounds.push(getComputedStyle(current).backgroundColor);
    return { foreground: getComputedStyle(element).color, backgrounds };
  });
  const foreground = colors.foreground.match(/[\d.]+/g)?.map(Number).slice(0, 3) || [];
  if (foreground.length !== 3) return 0;
  let background = [255, 255, 255];
  for (const value of colors.backgrounds.reverse()) {
    const channels = value.match(/[\d.]+/g)?.map(Number) || [];
    if (channels.length < 3) continue;
    const alpha = channels[3] ?? 1;
    if (alpha <= 0) continue;
    background = channels.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
  }
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

const app = express();
app.use(express.json());
app.get('/__qa', (req, res) => {
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  const actorId = Number(req.query.actorId) === 99 ? 99 : admin.id;
  const actor = { ...admin, id: actorId, username: actorId === 99 ? 'anonymous-feedback-second-admin' : admin.username };
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(actor))});localStorage.setItem('xmt_token',${JSON.stringify(`anonymous-feedback-admin-${actorId}`)});localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/admin/anonymous-feedback');</script>`);
});
app.get('/api/auth/me', (req, res) => {
  const actorId = Number(String(req.headers.authorization || '').replace('Bearer anonymous-feedback-admin-', '')) === 99 ? 99 : admin.id;
  res.json({ ...admin, id: actorId, username: actorId === 99 ? 'anonymous-feedback-second-admin' : admin.username });
});
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({}));
app.get('/api/admin/anonymous-feedback', (req, res) => {
  feedbackListGetCount += 1;
  if (req.header('if-none-match')) feedbackListConditionalRequestCount += 1;
  if (failNextFeedbackListGet) {
    failNextFeedbackListGet = false;
    return res.status(503).json({ message: '模拟列表刷新失败' });
  }
  const snapshot = feedbackPresent ? [{ ...storedFeedback }] : [];
  if (holdNextFeedbackListGet) {
    holdNextFeedbackListGet = false;
    heldFeedbackListResponses.push(() => { res.json({ data: snapshot }); });
    return;
  }
  return res.json({ data: snapshot });
});
app.patch('/api/admin/anonymous-feedback/:id', (req, res) => {
  feedbackUpdateCount += 1;
  const actorId = Number(String(req.headers.authorization || '').replace('Bearer anonymous-feedback-admin-', '')) || admin.id;
  const requestId = String(req.body?.client_request_id || '');
  const targetId = Number(req.params.id);
  if (requestId) {
    feedbackUpdateRequestIds.push(requestId);
    feedbackUpdateRequestBodies.push({ ...req.body });
  }
  if (failNextFeedbackUpdate) {
    failNextFeedbackUpdate = false;
    res.status(422).json({ message: '模拟更新失败' });
    return;
  }
  if (requestId && updateOutcome === 'fail-before-commit') {
    updateOutcome = 'success';
    res.status(503).json({ message: '模拟修改请求未提交' });
    return;
  }
  const changes: Record<string, unknown> = {};
  for (const field of ['status', 'reply_content', 'is_public']) {
    if (Object.hasOwn(req.body || {}, field)) changes[field] = req.body[field];
  }
  storedFeedback = { ...storedFeedback, ...changes, updated_at: new Date().toISOString() };
  feedbackBaseVersion += 1;
  storedFeedback.base_fingerprint = feedbackBaseVersion.toString(16).padStart(64, '0');
  if (requestId) feedbackUpdateLedger.set(requestId, { actorId, targetId, requestFingerprint: String(req.body?.request_fingerprint || '') });
  if (requestId && updateOutcome === 'commit-then-lose-response') {
    updateOutcome = 'success';
    res.status(503).json({ message: '模拟修改已提交但响应丢失' });
    return;
  }
  res.json({ data: storedFeedback });
});
app.get('/api/admin/anonymous-feedback/:targetId/update-requests/:requestId', (req, res) => {
  if (failNextUpdateStatusCode !== null) {
    const status = failNextUpdateStatusCode;
    failNextUpdateStatusCode = null;
    return res.status(status).json({ message: `模拟修改结果状态读取失败 ${status}` });
  }
  const actorId = Number(String(req.headers.authorization || '').replace('Bearer anonymous-feedback-admin-', '')) || admin.id;
  const request = feedbackUpdateLedger.get(req.params.requestId);
  if (!request) return res.json({ data: { state: feedbackPresent ? 'not_found' : 'target_missing' } });
  if (request.actorId !== actorId) return res.json({ data: { state: 'not_found' } });
  if (request.targetId !== Number(req.params.targetId) || request.requestFingerprint !== String(req.query.request_fingerprint || '')) return res.json({ data: { state: 'conflict' } });
  return res.json({ data: { state: 'processed' } });
});
app.get('/api/admin/anonymous-feedback/:targetId/delete-requests/:requestId', (req, res) => {
  feedbackDeleteStatusGetCount += 1;
  if (failNextDeleteStatusCode !== null) {
    const status = failNextDeleteStatusCode;
    failNextDeleteStatusCode = null;
    return res.status(status).json({ message: `模拟删除结果状态读取失败 ${status}` });
  }
  if (invalidateNextDeleteStatus) {
    invalidateNextDeleteStatus = false;
    return res.json({ data: { state: 'unexpected' } });
  }
  const actorId = Number(String(req.headers.authorization || '').replace('Bearer anonymous-feedback-admin-', '')) || admin.id;
  const request = feedbackDeleteLedger.get(req.params.requestId);
  if (!request) return res.json({ data: { state: feedbackPresent ? 'not_found' : 'target_missing' } });
  if (request.actorId !== actorId) return res.json({ data: { state: 'not_found' } });
  if (request.targetId !== Number(req.params.targetId)) return res.json({ data: { state: 'conflict' } });
  return res.json({ data: { state: 'committed' } });
});
app.delete('/api/admin/anonymous-feedback/:id', (req, res) => {
  feedbackDeleteCount += 1;
  const actorId = Number(String(req.headers.authorization || '').replace('Bearer anonymous-feedback-admin-', '')) || admin.id;
  const requestId = String(req.body?.client_request_id || '');
  feedbackDeleteRequestIds.push(requestId);
  if (deleteOutcome === 'fail-before-commit') {
    deleteOutcome = 'success';
    res.status(503).json({ message: '模拟删除请求未提交' });
    return;
  }
  feedbackPresent = false;
  if (requestId) feedbackDeleteLedger.set(requestId, { actorId, targetId: Number(req.params.id) });
  if (deleteOutcome === 'commit-then-lose-response') {
    deleteOutcome = 'success';
    res.status(503).json({ message: '模拟删除已提交但响应丢失' });
    return;
  }
  res.sendStatus(204);
});
app.post('/__qa/reset', (_req, res) => {
  storedFeedback = { ...feedback };
  feedbackPresent = true;
  feedbackBaseVersion = 0;
  failNextFeedbackUpdate = false;
  updateOutcome = 'success';
  failNextUpdateStatusCode = null;
  failNextFeedbackListGet = false;
  holdNextFeedbackListGet = false;
  feedbackDeleteLedger.clear();
  feedbackUpdateLedger.clear();
  feedbackUpdateRequestIds.length = 0;
  feedbackUpdateRequestBodies.length = 0;
  feedbackListConditionalRequestCount = 0;
  deleteOutcome = 'success';
  failNextDeleteStatusCode = null;
  invalidateNextDeleteStatus = false;
  res.sendStatus(204);
});
app.post('/__qa/delete-feedback-without-key', (_req, res) => {
  feedbackPresent = false;
  feedbackDeleteLedger.clear();
  res.sendStatus(204);
});
app.post('/__qa/fail-next-list-get', (_req, res) => {
  failNextFeedbackListGet = true;
  res.sendStatus(204);
});
app.post('/__qa/fail-before-next-update', (_req, res) => {
  updateOutcome = 'fail-before-commit';
  res.sendStatus(204);
});
app.post('/__qa/lose-after-next-update', (_req, res) => {
  updateOutcome = 'commit-then-lose-response';
  res.sendStatus(204);
});
app.post('/__qa/fail-next-update-status/:status', (req, res) => {
  const status = Number(req.params.status);
  if (status === 401 || status === 403 || status === 503) failNextUpdateStatusCode = status;
  res.sendStatus(204);
});
app.post('/__qa/hold-next-list-get', (_req, res) => {
  holdNextFeedbackListGet = true;
  res.sendStatus(204);
});
app.post('/__qa/fail-before-next-delete', (_req, res) => {
  deleteOutcome = 'fail-before-commit';
  res.sendStatus(204);
});
app.post('/__qa/lose-after-next-delete', (_req, res) => {
  deleteOutcome = 'commit-then-lose-response';
  res.sendStatus(204);
});
app.post('/__qa/fail-next-delete-status/:status', (req, res) => {
  const status = Number(req.params.status);
  if (status === 401 || status === 403 || status === 503) failNextDeleteStatusCode = status;
  res.sendStatus(204);
});
app.post('/__qa/invalidate-next-delete-status', (_req, res) => {
  invalidateNextDeleteStatus = true;
  res.sendStatus(204);
});
app.get('/__qa/held-list-get-count', (_req, res) => res.json({ count: heldFeedbackListResponses.length }));
app.post('/__qa/release-held-list-gets', (_req, res) => {
  const responses = heldFeedbackListResponses.splice(0);
  responses.forEach((release) => release());
  res.json({ released: responses.length });
});
app.get('/__qa/mutation-counts', (_req, res) => res.json({ feedbackUpdateCount, feedbackDeleteCount, feedbackListGetCount, feedbackListConditionalRequestCount, feedbackDeleteStatusGetCount, feedbackDeleteRequestIds, feedbackUpdateRequestIds, feedbackUpdateRequestBodies }));
app.use('/api', (_req, res) => res.json({ data: [] }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', () => undefined);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
const inspectionPort = Number(process.env.XMT_BROWSER_MCP_PORT) || 0;
await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(inspectionPort, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const useExternalBrowser = process.env.XMT_BROWSER_MCP_HOLD === '1';
const browser = useExternalBrowser ? null : await chromium.launch({ headless: true });

try {
  if (useExternalBrowser) {
    console.log(`Local anonymous feedback browser MCP fixture ready at ${base}; press Ctrl-C to stop it.`);
    await new Promise<void>((resolve) => process.once('SIGINT', resolve));
  } else if (browser) {
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      storedFeedback = { ...feedback };
      feedbackPresent = true;
      failNextFeedbackUpdate = false;
      failNextFeedbackListGet = false;
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (/\b(401|403|422|503)\b/.test(message.text())) expectedHttpErrors.push(message.text());
        else errors.push(message.text());
      });
      await page.goto(`${base}/__qa?theme=${theme}`);
      await page.getByRole('heading', { name: '匿名意见管理' }).waitFor();
      const actions = page.getByTestId(`feedback-row-actions-${feedback.id}`);
      await actions.waitFor();
      const feedbackSummary = feedback.content.replace(/\s+/g, ' ').trim().slice(0, 48);
      const actionButton = (label: string) => actions.getByRole('button', { name: `${label}：${feedbackSummary}`, exact: true });
      for (const label of ['查看意见详情', '标记为处理中', '标记为已完成', '隐藏意见', '回复匿名意见', '删除匿名意见']) {
        assert.equal(await actionButton(label).count(), 1, `${theme}/${width}px ${label} action has an explicit accessible name with feedback context`);
      }
      const geometry = await actions.evaluate((cell) => {
        const scrollArea = cell.closest('div.overflow-x-auto');
        const rect = cell.getBoundingClientRect();
        return {
          position: getComputedStyle(cell).position,
          cellLeft: rect.left,
          cellRight: rect.right,
          viewportWidth: document.documentElement.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
          scrollAreaLeft: scrollArea?.getBoundingClientRect().left ?? -1,
          scrollAreaRight: scrollArea?.getBoundingClientRect().right ?? -1,
          buttons: [...cell.querySelectorAll('button')].map((button) => {
            const buttonRect = button.getBoundingClientRect();
            return { left: buttonRect.left, right: buttonRect.right };
          }),
        };
      });
      assert.equal(geometry.position, 'sticky', `${theme}/${width}px operation cell remains fixed during table scrolling`);
      const outerCardOverflow = await page.getByTestId('anonymous-feedback-admin-table-panel').evaluate((panel) => ({ x: getComputedStyle(panel).overflowX, y: getComputedStyle(panel).overflowY }));
      assert.deepEqual(outerCardOverflow, { x: 'visible', y: 'visible' }, `${theme}/${width}px outer card does not clip the responsive table shell`);
      assert.ok(geometry.cellLeft >= geometry.scrollAreaLeft - 1, `${theme}/${width}px actions are inside the left viewport edge`);
      assert.ok(geometry.cellRight <= geometry.scrollAreaRight + 1, `${theme}/${width}px actions are inside the right viewport edge: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.buttons.length >= 5 && geometry.buttons.every((button) => button.left >= geometry.scrollAreaLeft - 1 && button.right <= geometry.scrollAreaRight + 1), `${theme}/${width}px every row action is visible: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.pageWidth <= geometry.viewportWidth, `${theme}/${width}px page has no horizontal overflow`);
      assert.ok(await contrastRatio(page.getByText('待处理', { exact: true })) >= 4.5, `${theme}/${width}px status text contrast is at least 4.5:1`);
      assert.ok(await contrastRatio(actionButton('删除匿名意见').locator('svg')) >= 3, `${theme}/${width}px delete icon contrast is at least 3:1`);
      if (theme === 'dark' && width === 1440) {
        await page.evaluate(() => fetch('/__qa/fail-next-list-get', { method: 'POST' }));
        await actionButton('标记为处理中').click();
        await page.getByRole('alert').filter({ hasText: '意见已标记为处理中' }).waitFor();
        await page.evaluate(() => fetch('/__qa/hold-next-list-get', { method: 'POST' }));
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await page.waitForFunction(async () => (await (await fetch('/__qa/held-list-get-count')).json()).count === 1);
        await actionButton('标记为已完成').click();
        await page.getByText('状态已更新', { exact: true }).waitFor();
        assert.equal(storedFeedback.status, 'completed', 'the newer confirmed status is stored while an older list read is pending');
        await page.evaluate(() => fetch('/__qa/release-held-list-gets', { method: 'POST' }));
        await page.waitForTimeout(100);
        assert.equal(await page.getByText('已完成', { exact: true }).count(), 1, 'an older list response cannot overwrite a newer confirmed mutation');
        await page.evaluate(() => fetch('/__qa/reset', { method: 'POST' }));
        await page.reload();
        await page.getByRole('heading', { name: '匿名意见管理' }).waitFor();
        await actions.waitFor();

        await actionButton('标记为处理中').click();
        await page.getByText('状态已更新', { exact: true }).waitFor();
        assert.equal(storedFeedback.status, 'processing', 'successful status mutation persists in the isolated fixture');

        await actionButton('隐藏意见').click();
        await page.getByText('公开状态已更新', { exact: true }).waitFor();
        assert.equal(Number(storedFeedback.is_public), 0, 'successful visibility mutation persists in the isolated fixture');

        failNextFeedbackUpdate = true;
        await actionButton('公开意见').click();
        await page.getByText('更新失败', { exact: true }).waitFor();
        assert.equal(Number(storedFeedback.is_public), 0, 'failed visibility mutation leaves the persisted state unchanged');
        assert.equal(await actionButton('公开意见').count(), 1, 'the failed mutation does not optimistically change the row action');

        const updateCountBeforeRefreshFailure = feedbackUpdateCount;
        const getCountBeforeRefreshFailure = feedbackListGetCount;
        failNextFeedbackListGet = true;
        await actionButton('标记为已完成').click();
        await page.getByRole('alert').filter({ hasText: '意见已标记为已完成' }).waitFor();
        assert.equal(storedFeedback.status, 'completed', 'the confirmed status change remains persisted when its list refresh fails');
        assert.equal(await page.getByText('已完成', { exact: true }).count(), 1, 'the confirmed status change remains visible locally');
        assert.equal(feedbackUpdateCount, updateCountBeforeRefreshFailure + 1, 'the confirmed status update is sent once');
        assert.equal(feedbackListGetCount, getCountBeforeRefreshFailure + 1, 'the status update is followed by one failed list read');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await page.getByText('已完成', { exact: true }).waitFor();
        assert.equal(feedbackUpdateCount, updateCountBeforeRefreshFailure + 1, 'list retry does not repeat the status update');
        assert.equal(feedbackListGetCount, getCountBeforeRefreshFailure + 2, 'list retry adds only one GET');

        const updateCountBeforeVisibilityRefresh = feedbackUpdateCount;
        const getCountBeforeVisibilityRefresh = feedbackListGetCount;
        failNextFeedbackListGet = true;
        await actionButton('公开意见').click();
        await page.getByRole('alert').filter({ hasText: '该条意见已公开' }).waitFor();
        assert.equal(Number(storedFeedback.is_public), 1, 'the confirmed visibility change remains persisted when its list refresh fails');
        assert.equal(await actionButton('隐藏意见').count(), 1, 'the confirmed visibility change remains visible locally');
        assert.equal(feedbackUpdateCount, updateCountBeforeVisibilityRefresh + 1, 'the visibility update is sent once');
        assert.equal(feedbackListGetCount, getCountBeforeVisibilityRefresh + 1, 'the visibility update is followed by one failed list read');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await actionButton('隐藏意见').waitFor();
        assert.equal(feedbackUpdateCount, updateCountBeforeVisibilityRefresh + 1, 'list retry does not repeat the visibility update');
        assert.equal(feedbackListGetCount, getCountBeforeVisibilityRefresh + 2, 'visibility retry adds only one GET');

        const updateCountBeforeReply = feedbackUpdateCount;
        const getCountBeforeReply = feedbackListGetCount;
        failNextFeedbackListGet = true;
        await actionButton('回复匿名意见').click();
        await page.getByRole('heading', { name: '回复意见' }).waitFor();
        await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('已核实，安排在本周改进。');
        await page.getByRole('button', { name: '保存回复', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: '回复已保存，意见已标记为完成' }).waitFor();
        assert.equal(storedFeedback.reply_content, '已核实，安排在本周改进。', 'the confirmed reply remains saved when its list refresh fails');
        assert.equal(feedbackUpdateCount, updateCountBeforeReply + 1, 'the reply update is sent once');
        assert.equal(feedbackListGetCount, getCountBeforeReply + 1, 'the reply update is followed by one failed list read');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await page.getByText(feedback.content, { exact: true }).waitFor();
        assert.equal(feedbackUpdateCount, updateCountBeforeReply + 1, 'list retry does not repeat the reply update');

      }
      await actionButton('回复匿名意见').click();
      await page.getByRole('heading', { name: '回复意见' }).waitFor();
      await page.getByRole('textbox', { name: '回复内容', exact: true }).waitFor();
      await page.getByRole('button', { name: '取消' }).click();
      await page.screenshot({ path: `/tmp/xmt-anonymous-feedback-admin-${theme}-${width}.png`, fullPage: true });
      if (theme === 'dark' && width === 1440) {
        const deleteCountBefore = feedbackDeleteCount;
        const getCountBeforeDelete = feedbackListGetCount;
        failNextFeedbackListGet = true;
        await actionButton('删除匿名意见').click();
        await page.getByRole('heading', { name: '删除意见' }).waitFor();
        await page.getByRole('button', { name: '删除', exact: true }).last().click();
        await page.getByRole('alert').filter({ hasText: '匿名意见已删除' }).waitFor();
        assert.equal(feedbackPresent, false, 'the delete operation is confirmed by the isolated server');
        assert.equal(await page.getByTestId(`feedback-row-actions-${feedback.id}`).count(), 0, 'the confirmed deleted row is removed before refresh completes');
        assert.equal(feedbackDeleteCount, deleteCountBefore + 1, 'the delete request is sent once');
        assert.equal(feedbackListGetCount, getCountBeforeDelete + 1, 'delete is followed by one failed list read');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await page.getByText('暂无匿名意见', { exact: true }).waitFor();
        assert.equal(feedbackDeleteCount, deleteCountBefore + 1, 'list retry does not repeat the delete');
        assert.equal(feedbackListGetCount, getCountBeforeDelete + 2, 'delete retry adds only one GET');
      }
      if (theme === 'light' && width === 320) {
        failNextFeedbackListGet = true;
        await actionButton('标记为处理中').click();
        await page.getByRole('alert').filter({ hasText: '意见已标记为处理中' }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '320px refresh warning does not cause horizontal overflow');
        await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
        await page.getByText('处理中', { exact: true }).waitFor();
      }
      await page.close();
    }
  }
  const recoveryPage = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  recoveryPage.on('pageerror', (error) => errors.push(error.message));
  recoveryPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/\b(401|403|422|503)\b/.test(message.text())) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });
  await recoveryPage.request.post(`${base}/__qa/reset`);
  await recoveryPage.request.post(`${base}/__qa/lose-after-next-delete`);
  await recoveryPage.request.post(`${base}/__qa/fail-next-delete-status/503`);
  await recoveryPage.goto(`${base}/__qa?actorId=98`);
  await recoveryPage.getByRole('heading', { name: '匿名意见管理' }).waitFor();
  const recoveryActions = recoveryPage.getByTestId(`feedback-row-actions-${feedback.id}`);
  const recoveryDeleteButton = recoveryActions.getByRole('button', { name: `删除匿名意见：${feedback.content}`, exact: true });
  await recoveryDeleteButton.click();
  await recoveryPage.getByRole('heading', { name: '删除意见' }).waitFor();
  const deleteConfirm = recoveryPage.getByRole('button', { name: '删除', exact: true }).last();
  const firstDeleteRequest = recoveryPage.waitForRequest((request) => request.method() === 'DELETE' && request.url().includes(`/api/admin/anonymous-feedback/${feedback.id}`));
  await deleteConfirm.click();
  await firstDeleteRequest;
  const markerAtFirstSend = await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-delete-pending:actor:98'));
  const markerAtFirstSendValue = JSON.parse(markerAtFirstSend || '{}') as Record<string, unknown>;
  assert.deepEqual(Object.keys(markerAtFirstSendValue).sort(), ['actorId', 'requestId', 'targetId'], 'the recovery marker is stored before the DELETE request starts');
  await recoveryPage.getByRole('alert').filter({ hasText: '删除结果暂时无法核实' }).waitFor();
  assert.equal(feedbackPresent, false, 'the lost response fixture commits the deletion');
  assert.equal(await recoveryActions.count(), 1, 'an unknown result does not optimistically remove the row before read-only verification');
  assert.equal(await recoveryActions.getByRole('button', { name: `标记为已完成：${feedback.content}`, exact: true }).isDisabled(), true, 'other write entrypoints stay locked while the result is unknown');
  const committedRecoveryMarker = await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-delete-pending:actor:98'));
  const committedRecovery = JSON.parse(committedRecoveryMarker || '{}') as Record<string, unknown>;
  assert.deepEqual(Object.keys(committedRecovery).sort(), ['actorId', 'requestId', 'targetId'], 'the browser stores only actor, request ID, and target ID');
  assert.equal(committedRecovery.actorId, 98);
  assert.equal(committedRecovery.targetId, feedback.id);
  assert.match(String(committedRecovery.requestId), /^[0-9a-f-]{36}$/i);
  const committedDeleteRequestCount = feedbackDeleteCount;
  await recoveryPage.reload({ waitUntil: 'domcontentloaded' });
  await recoveryPage.getByText('暂无匿名意见', { exact: true }).waitFor();
  assert.equal(await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-delete-pending:actor:98')), null, 'refresh status confirms and clears a committed delete marker');
  assert.equal(feedbackDeleteCount, committedDeleteRequestCount, 'refresh recovery uses only GET and does not repeat DELETE');

  await recoveryPage.request.post(`${base}/__qa/reset`);
  await recoveryPage.request.post(`${base}/__qa/fail-before-next-delete`);
  await recoveryPage.request.post(`${base}/__qa/fail-next-delete-status/403`);
  await recoveryPage.goto(`${base}/__qa?actorId=98`);
  await recoveryPage.getByRole('heading', { name: '匿名意见管理' }).waitFor();
  const uncommittedActions = recoveryPage.getByTestId(`feedback-row-actions-${feedback.id}`);
  const uncommittedDeleteCount = feedbackDeleteCount;
  await uncommittedActions.getByRole('button', { name: `删除匿名意见：${feedback.content}`, exact: true }).click();
  await recoveryPage.getByRole('button', { name: '删除', exact: true }).last().click();
  await recoveryPage.getByRole('alert').filter({ hasText: '删除结果暂时无法核实' }).waitFor();
  assert.equal(feedbackPresent, true, 'the failed-before-commit fixture leaves the row untouched');
  assert.equal(feedbackDeleteCount, uncommittedDeleteCount + 1, 'an unknown or forbidden status read does not repeat DELETE');
  assert.equal(await uncommittedActions.getByRole('button', { name: `标记为已完成：${feedback.content}`, exact: true }).isDisabled(), true, '403 status read does not unlock other write actions');
  await recoveryPage.request.post(`${base}/__qa/invalidate-next-delete-status`);
  await recoveryPage.getByRole('button', { name: '只读重新核实', exact: true }).click();
  await recoveryPage.getByRole('alert').filter({ hasText: '删除结果暂时无法核实' }).waitFor();
  assert.equal(await uncommittedActions.getByRole('button', { name: `标记为已完成：${feedback.content}`, exact: true }).isDisabled(), true, 'an unexpected status payload does not unlock other writes');
  await recoveryPage.request.post(`${base}/__qa/fail-next-delete-status/401`);
  const unauthorizedStatus = recoveryPage.waitForResponse((response) => response.url().includes('/delete-requests/') && response.status() === 401);
  await recoveryPage.getByRole('button', { name: '只读重新核实', exact: true }).click();
  await unauthorizedStatus;
  await recoveryPage.getByRole('alert').filter({ hasText: '删除结果暂时无法核实' }).waitFor();
  assert.equal(await uncommittedActions.getByRole('button', { name: `标记为已完成：${feedback.content}`, exact: true }).isDisabled(), true, '401 status read does not unlock other writes');
  const uncommittedMarkerBeforeSwitch = await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-delete-pending:actor:98'));
  const uncommittedRequestId = String(JSON.parse(uncommittedMarkerBeforeSwitch || '{}').requestId || '');

  await recoveryPage.goto(`${base}/__qa?actorId=99`);
  await recoveryPage.getByRole('heading', { name: '匿名意见管理' }).waitFor();
  const otherActorActions = recoveryPage.getByTestId(`feedback-row-actions-${feedback.id}`);
  await otherActorActions.waitFor();
  assert.equal(await recoveryPage.getByRole('alert').filter({ hasText: '删除请求编号' }).count(), 0, 'another actor is not locked by the first actor recovery marker');
  assert.equal(await otherActorActions.getByRole('button', { name: `标记为已完成：${feedback.content}`, exact: true }).isEnabled(), true, 'another actor keeps independent write access');
  assert.ok(await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-delete-pending:actor:98')), 'switching actors preserves the original actor recovery marker');
  assert.equal(await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-delete-pending:actor:99')), null, 'the other actor has no copied recovery marker');

  await recoveryPage.goto(`${base}/__qa?actorId=98`);
  await recoveryPage.getByRole('alert').filter({ hasText: '服务端当前没有找到本操作者' }).waitFor();
  const retryBefore = feedbackDeleteCount;
  await recoveryPage.getByRole('button', { name: '使用原请求重试', exact: true }).click();
  await recoveryPage.getByText('暂无匿名意见', { exact: true }).waitFor();
  assert.equal(feedbackDeleteCount, retryBefore + 1, 'not_found enables only an explicit retry');
  assert.equal(feedbackDeleteRequestIds.at(-1), uncommittedRequestId, 'the explicit retry reuses the original UUID');
  assert.equal(feedbackDeleteRequestIds.at(-2), uncommittedRequestId, 'the initial delete and retry share one UUID');
  assert.equal(await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-delete-pending:actor:98')), null, 'the explicit retry success clears the actor-scoped recovery marker');

  await recoveryPage.request.post(`${base}/__qa/reset`);
  await recoveryPage.request.post(`${base}/__qa/delete-feedback-without-key`);
  await recoveryPage.goto(`${base}/__qa?actorId=98`);
  await recoveryPage.getByRole('heading', { name: '匿名意见管理' }).waitFor();
  const missingTargetRequestId = 'e01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57';
  await recoveryPage.evaluate(({ requestId, targetId }) => {
    window.sessionStorage.setItem('xmt:anonymous-feedback-delete-pending:actor:98', JSON.stringify({ actorId: 98, requestId, targetId }));
  }, { requestId: missingTargetRequestId, targetId: feedback.id });
  const deleteRequestsBeforeMissingTargetRecovery = feedbackDeleteCount;
  await recoveryPage.reload({ waitUntil: 'domcontentloaded' });
  await recoveryPage.getByRole('status').filter({ hasText: '本次操作未确认删除成功' }).waitFor();
  assert.equal(await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-delete-pending:actor:98')), null, 'a target missing outside this request clears the obsolete recovery marker');
  assert.equal(feedbackDeleteCount, deleteRequestsBeforeMissingTargetRecovery, 'target-missing recovery is read-only and does not retry DELETE');
  assert.equal(await recoveryPage.getByText('暂无匿名意见', { exact: true }).count(), 1, 'target-missing is not presented as a successful deletion');
  await recoveryPage.request.post(`${base}/__qa/reset`);
  await recoveryPage.reload({ waitUntil: 'domcontentloaded' });
  await recoveryPage.getByTestId(`feedback-row-actions-${feedback.id}`).getByRole('button', { name: `标记为处理中：${feedback.content}`, exact: true }).waitFor();
  assert.equal(await recoveryPage.getByTestId(`feedback-row-actions-${feedback.id}`).getByRole('button', { name: `标记为处理中：${feedback.content}`, exact: true }).isEnabled(), true, 'after target-missing resolution, subsequent writes are unlocked');

  await recoveryPage.request.post(`${base}/__qa/reset`);
  await recoveryPage.evaluate(() => {
    window.sessionStorage.removeItem('xmt:anonymous-feedback-update-pending:actor:98');
    window.localStorage.removeItem('xmt:anonymous-feedback-update-pending:actor:98');
  });
  await recoveryPage.request.post(`${base}/__qa/lose-after-next-update`);
  await recoveryPage.request.post(`${base}/__qa/fail-next-update-status/503`);
  await recoveryPage.goto(`${base}/__qa?actorId=98`);
  await recoveryPage.getByRole('heading', { name: '匿名意见管理' }).waitFor();
  const lostUpdateActions = recoveryPage.getByTestId(`feedback-row-actions-${feedback.id}`);
  await lostUpdateActions.getByRole('button', { name: `标记为处理中：${feedback.content}`, exact: true }).click();
  await recoveryPage.getByTestId('feedback-update-recovery').filter({ hasText: '修改结果暂时无法核实' }).waitFor();
  assert.equal(storedFeedback.status, 'processing', 'the isolated memory fixture committed the update before losing the response');
  assert.equal(feedbackUpdateRequestIds.length, 1, 'the lost-response path sends one keyed PATCH');
  assert.equal(await lostUpdateActions.getByRole('button', { name: `标记为已完成：${feedback.content}`, exact: true }).isDisabled(), true, 'unknown update result locks other writes for the target');
  const lostUpdateMarker = await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-update-pending:actor:98'));
  const lostUpdateRecovery = JSON.parse(lostUpdateMarker || '{}') as Record<string, unknown>;
  assert.equal(lostUpdateRecovery.actorId, 98);
  assert.equal(lostUpdateRecovery.targetId, feedback.id);
  assert.equal(lostUpdateRecovery.payload && (lostUpdateRecovery.payload as Record<string, unknown>).status, 'processing', 'the full original payload is persisted before PATCH');
  const lostUpdateCount = feedbackUpdateCount;
  await recoveryPage.reload({ waitUntil: 'domcontentloaded' });
  await recoveryPage.getByRole('status').filter({ hasText: '意见修改已确认' }).waitFor();
  assert.equal(await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-update-pending:actor:98')), null, 'reload status recovery clears a confirmed marker');
  assert.equal(await recoveryPage.evaluate(() => window.localStorage.getItem('xmt:anonymous-feedback-update-pending:actor:98')), null, 'reload status recovery clears both browser stores');
  assert.equal(feedbackUpdateCount, lostUpdateCount, 'reload recovery reads status and list without repeating PATCH');

  await recoveryPage.request.post(`${base}/__qa/reset`);
  await recoveryPage.evaluate(() => {
    window.sessionStorage.removeItem('xmt:anonymous-feedback-update-pending:actor:98');
    window.localStorage.removeItem('xmt:anonymous-feedback-update-pending:actor:98');
  });
  await recoveryPage.request.post(`${base}/__qa/fail-before-next-update`);
  await recoveryPage.goto(`${base}/__qa?actorId=98`);
  await recoveryPage.getByRole('heading', { name: '匿名意见管理' }).waitFor();
  const retryUpdateActions = recoveryPage.getByTestId(`feedback-row-actions-${feedback.id}`);
  await retryUpdateActions.getByRole('button', { name: `标记为处理中：${feedback.content}`, exact: true }).click();
  await recoveryPage.getByTestId('feedback-update-recovery').filter({ hasText: '服务端尚未找到这次修改' }).waitFor();
  const notFoundUpdateMarker = await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-update-pending:actor:98'));
  const notFoundRecovery = JSON.parse(notFoundUpdateMarker || '{}') as Record<string, unknown>;
  const originalUpdateRequestId = String(notFoundRecovery.requestId || '');
  assert.match(originalUpdateRequestId, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(notFoundRecovery.payload, { status: 'processing' }, 'not_found recovery retains the exact original status payload');
  assert.equal(notFoundRecovery.baseFingerprint, feedback.base_fingerprint, 'the original CAS baseline is preserved');
  const requestsBeforeExplicitRetry = feedbackUpdateCount;
  await retryUpdateActions.getByRole('button', { name: '使用原请求重试', exact: true }).click();
  await recoveryPage.getByRole('status').filter({ hasText: '意见修改已确认' }).waitFor();
  assert.equal(feedbackUpdateCount, requestsBeforeExplicitRetry + 1, 'not_found does not auto-retry; one explicit click sends the retry');
  assert.equal(feedbackUpdateRequestIds.at(-1), originalUpdateRequestId, 'explicit update retry reuses the original request UUID');
  assert.equal(feedbackUpdateRequestIds.at(-2), originalUpdateRequestId, 'the initial request and retry share one UUID');
  assert.deepEqual(feedbackUpdateRequestBodies.at(-1), feedbackUpdateRequestBodies.at(-2), 'retry uses the exact persisted payload and fingerprints');
  assert.equal(await recoveryPage.evaluate(() => window.sessionStorage.getItem('xmt:anonymous-feedback-update-pending:actor:98')), null, 'successful explicit retry clears its marker');

  await recoveryPage.close();
  assert.deepEqual(errors, [], 'anonymous feedback admin has no browser errors');
  assert.equal(feedbackListConditionalRequestCount, 0, 'admin feedback list requests bypass cached 304 responses so first load always reads a usable body');
  assert.equal(expectedHttpErrors.length, 15, 'the isolated refresh and recovery failure fixtures return exactly fifteen intentional 401/403/422/503 responses');
  console.log('匿名意见管理亮/暗主题 × 320/390/1440px 操作可见与对比度回归通过');
  }
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await vite.close();
  io.close();
}
