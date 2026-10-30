import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const version = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const user = { id: 983, username: 'shooting-delete-qa', name: '制作计划验收', role: 'editor', enabled: true, force_change_password: false };
const topic = { id: 9831, title: '隔离制作计划删除验收', status: 'shooting', creator_id: user.id, assignee_id: user.id };
const shooting = {
  id: 9832,
  topic_id: topic.id,
  topic_title: topic.title,
  topic_status: topic.status,
  plan_date: '2026-10-20',
  location: '隔离拍摄点',
  equipment: '测试设备',
  status: 'in_progress',
  operator_id: user.id,
  operator_name: user.name,
};
type Scenario =
  | 'deleted-after-error'
  | 'still-exists'
  | 'read-fails-once'
  | 'completion-applied-after-error'
  | 'completion-still-in-progress'
  | 'completion-read-fails-once'
  | 'detail-status-applied-after-error'
  | 'detail-status-still-in-progress'
  | 'detail-status-read-fails-once';
let scenario: Scenario = 'deleted-after-error';
let rows = [{ ...shooting }];
let deleteWrites = 0;
let completionWrites = 0;
let detailReads = 0;
let detailStatusWrites = 0;
let detailStatusRecoveryReadFailed = false;

function reset(nextScenario: Scenario) {
  scenario = nextScenario;
  rows = [{ ...shooting }];
  deleteWrites = 0;
  completionWrites = 0;
  detailReads = 0;
  detailStatusWrites = 0;
  detailStatusRecoveryReadFailed = false;
}

const app = express();
app.use(express.json());
app.get('/__qa-shooting', (req, res) => {
  const requested = String(req.query.scenario || 'deleted-after-error') as Scenario;
  if (['deleted-after-error', 'still-exists', 'read-fails-once', 'completion-applied-after-error', 'completion-still-in-progress', 'completion-read-fails-once', 'detail-status-applied-after-error', 'detail-status-still-in-progress', 'detail-status-read-fails-once'].includes(requested)) reset(requested);
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('xmt_token','shooting-delete-fixture');localStorage.setItem('xmt_theme','dark');localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/shooting');</script>`);
});
app.get('/__qa-shooting/state', (_req, res) => res.json({ scenario, rows: rows.map((row) => ({ id: row.id, status: row.status })), deleteWrites, completionWrites, detailReads }));
app.get('/__qa-shooting/detail-state', (_req, res) => res.json({ detailStatusWrites, detailReads, rows: rows.map((row) => ({ id: row.id, status: row.status })) }));
app.get('/api/auth/me', (_req, res) => res.json(user));
app.get('/api/permissions/my', (_req, res) => res.json(['workflow:shooting']));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({ version }));
app.get('/api/topics', (_req, res) => res.json({ success: true, data: [topic], pagination: { total: 1, page: 1, limit: 20 } }));
app.get('/api/workflow/shooting', (_req, res) => res.json({ data: rows, total: rows.length, page: 1, limit: 20 }));
app.get('/api/workflow/shooting/:id', (req, res) => {
  detailReads += 1;
  if ((scenario === 'read-fails-once' || scenario === 'completion-read-fails-once') && detailReads === 1) return res.status(503).json({ message: '隔离验收：详情读取暂不可用' });
  if (scenario === 'detail-status-read-fails-once' && detailStatusWrites > 0 && !detailStatusRecoveryReadFailed) {
    detailStatusRecoveryReadFailed = true;
    return res.status(503).json({ message: '隔离验收：状态核实读取暂不可用' });
  }
  const record = rows.find((row) => row.id === Number(req.params.id));
  if (!record) return res.status(404).json({ message: '成片制作记录不存在' });
  return res.json(record);
});
app.delete('/api/workflow/shooting/:id', async (req, res) => {
  deleteWrites += 1;
  if (scenario !== 'still-exists') rows = rows.filter((row) => row.id !== Number(req.params.id));
  await new Promise((resolve) => setTimeout(resolve, 80));
  return res.status(503).json({ message: '隔离验收：删除响应未能确认' });
});
app.put('/api/workflow/shooting/:id', async (req, res) => {
  if (scenario.startsWith('detail-status-')) {
    detailStatusWrites += 1;
    if (scenario === 'detail-status-still-in-progress' && detailStatusWrites === 1) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return res.status(503).json({ message: '隔离验收：状态更新响应未能确认' });
    }
    rows = rows.map((row) => row.id === Number(req.params.id) ? { ...row, status: String(req.body.status || row.status) } : row);
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (scenario === 'detail-status-still-in-progress' && detailStatusWrites > 1) return res.json({ message: '隔离验收：明确重试已确认' });
    return res.status(503).json({ message: '隔离验收：状态更新响应未能确认' });
  }
  completionWrites += 1;
  if (scenario !== 'completion-still-in-progress') {
    rows = rows.map((row) => row.id === Number(req.params.id) ? { ...row, status: String(req.body.status || row.status) } : row);
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
  return res.status(503).json({ message: '隔离验收：完成响应未能确认' });
});
app.use('/api', (_req, res) => res.json({ data: [], total: 0, page: 1, limit: 20 }));

const server = http.createServer(app);
const io = new SocketServer(server);
io.on('connection', (socket) => {
  socket.on('join', (room: string) => socket.join(room));
  socket.on('leave', (room: string) => socket.leave(room));
});
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: { server } }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

async function closeFixture() {
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

if (process.env.XMT_SHOOTING_DELETE_RECOVERY_QA_SERVE === '1') {
  console.log(`Isolated shooting delete recovery fixture: ${base}/__qa-shooting`);
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await closeFixture();
} else {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const unexpectedErrors: string[] = [];
    const expectedHttpErrors: string[] = [];
    page.on('pageerror', (error) => unexpectedErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error' || /(404 \(Not Found\)|503 \(Service Unavailable\))/.test(message.text())) return;
      unexpectedErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const path = new URL(response.url()).pathname;
      if (path === `/api/workflow/shooting/${shooting.id}` && [404, 503].includes(response.status())) {
        expectedHttpErrors.push(`${response.status()} ${path}`);
        return;
      }
      unexpectedErrors.push(`Unexpected HTTP ${response.status()} ${path}`);
    });

    const openFixture = async (nextScenario: Scenario) => {
      await page.goto(`${base}/__qa-shooting?scenario=${nextScenario}`);
      await page.getByRole('heading', { name: '成片制作', exact: true }).waitFor();
      await page.getByText(topic.title, { exact: true }).waitFor();
    };
    const confirmDelete = async () => {
      await page.getByRole('button', { name: `删除《${topic.title}》` }).click();
      await page.getByRole('dialog').getByRole('button', { name: '确认删除' }).click();
    };
    const readState = async () => await page.evaluate(async () => {
      const response = await fetch('/__qa-shooting/state');
      return response.json() as Promise<{ deleteWrites: number; completionWrites: number; detailReads: number; rows: Array<{ id: number; status: string }> }>;
    });
    const readDetailState = async () => await page.evaluate(async () => {
      const response = await fetch('/__qa-shooting/detail-state');
      return response.json() as Promise<{ detailStatusWrites: number; detailReads: number; rows: Array<{ id: number; status: string }> }>;
    });
    const openDetailFixture = async (nextScenario: Extract<Scenario, `detail-status-${string}`>) => {
      await openFixture(nextScenario);
      await page.goto(`${base}/shooting/${shooting.id}`);
      await page.getByRole('heading', { name: topic.title }).waitFor();
      await page.getByRole('button', { name: '完成制作' }).waitFor();
    };

    // The DELETE took effect but its 503 response was ambiguous: one GET/404 confirms it without a retry.
    await openFixture('deleted-after-error');
    await confirmDelete();
    await page.getByText(`服务器确认“${topic.title}”已删除；未重复发送删除请求。`).waitFor();
    await page.getByText('暂无制作计划').waitFor();
    assert.deepEqual(await readState(), { deleteWrites: 1, completionWrites: 0, detailReads: 1, rows: [] });
    await page.screenshot({ path: '/private/tmp/xmt-shooting-delete-confirmed.png', fullPage: false });

    // The record still exists: report that fact and leave any next DELETE to a new explicit user confirmation.
    await openFixture('still-exists');
    await confirmDelete();
    await page.getByRole('status').filter({ hasText: '服务器确认' }).waitFor();
    await page.getByRole('button', { name: `删除《${topic.title}》` }).waitFor();
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.deepEqual(await readState(), { deleteWrites: 1, completionWrites: 0, detailReads: 1, rows: [{ id: shooting.id, status: shooting.status }] });

    // If both DELETE and its first read-back are uncertain, writes stay locked; a reload retries GET only.
    await openFixture('read-fails-once');
    await confirmDelete();
    await page.getByRole('alert').filter({ hasText: '请只读重试核实，不要重复删除。' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '添加制作计划' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: `删除《${topic.title}》` }).isDisabled(), true);
    assert.deepEqual(await readState(), { deleteWrites: 1, completionWrites: 0, detailReads: 1, rows: [] });
    await page.screenshot({ path: '/private/tmp/xmt-shooting-delete-pending-verification.png', fullPage: false });
    await page.reload();
    await page.getByText('暂无制作计划').waitFor();
    await page.getByRole('alert').waitFor({ state: 'detached' });
    await page.getByText(`服务器确认“${topic.title}”已删除；未重复发送删除请求。`).waitFor();
    assert.deepEqual(await readState(), { deleteWrites: 1, completionWrites: 0, detailReads: 2, rows: [] });

    const confirmComplete = async () => {
      await page.getByRole('button', { name: '完成', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: '确认完成' }).click();
    };
    const suppressRecoveryStorageWrite = async (key: string) => page.evaluate((targetKey) => {
      const typedWindow = window as Window & { __xmtOriginalStorageSetItem?: typeof Storage.prototype.setItem };
      if (!typedWindow.__xmtOriginalStorageSetItem) typedWindow.__xmtOriginalStorageSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(storageKey: string, value: string) {
        if (this === window.sessionStorage && storageKey === targetKey) return;
        return typedWindow.__xmtOriginalStorageSetItem?.call(this, storageKey, value);
      };
    }, key);
    const restoreRecoveryStorageWrite = async () => page.evaluate(() => {
      const typedWindow = window as Window & { __xmtOriginalStorageSetItem?: typeof Storage.prototype.setItem };
      if (typedWindow.__xmtOriginalStorageSetItem) Storage.prototype.setItem = typedWindow.__xmtOriginalStorageSetItem;
      delete typedWindow.__xmtOriginalStorageSetItem;
    });

    await openFixture('still-exists');
    const deleteRecoveryKey = `xmt:shooting-delete-pending:v1:user:${user.id}`;
    await suppressRecoveryStorageWrite(deleteRecoveryKey);
    await confirmDelete();
    await page.getByText('制作计划删除恢复信息未能完整保存，本次未发送删除请求', { exact: true }).waitFor();
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), deleteRecoveryKey), null, 'a silent delete-recovery write drop leaves no marker');
    assert.deepEqual(await readState(), { deleteWrites: 0, completionWrites: 0, detailReads: 0, rows: [{ id: shooting.id, status: shooting.status }] }, 'delete is not sent until its recovery marker is confirmed');
    await restoreRecoveryStorageWrite();

    await openFixture('completion-still-in-progress');
    const completionRecoveryKey = `xmt:shooting-completion-pending:v1:user:${user.id}`;
    await suppressRecoveryStorageWrite(completionRecoveryKey);
    await confirmComplete();
    await page.getByText('成片完成恢复信息未能完整保存，本次未发送状态更新', { exact: true }).waitFor();
    assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), completionRecoveryKey), null, 'a silent completion-recovery write drop leaves no marker');
    assert.deepEqual(await readState(), { deleteWrites: 0, completionWrites: 0, detailReads: 0, rows: [{ id: shooting.id, status: shooting.status }] }, 'completion is not sent until its recovery marker is confirmed');
    await restoreRecoveryStorageWrite();

    // The PUT took effect but its response was ambiguous: the read-back confirms completion without a retry.
    await openFixture('completion-applied-after-error');
    await confirmComplete();
    await page.getByText(`服务器确认“${topic.title}”已完成；未重复提交完成操作。`).waitFor();
    await page.getByText('进入发布管理').waitFor();
    assert.deepEqual(await readState(), {
      deleteWrites: 0,
      completionWrites: 1,
      detailReads: 1,
      rows: [{ id: shooting.id, status: 'completed' }],
    });
    await page.screenshot({ path: '/private/tmp/xmt-shooting-completion-confirmed.png', fullPage: false });

    // The PUT did not take effect: expose the server status and leave any retry to a new explicit confirmation.
    await openFixture('completion-still-in-progress');
    await confirmComplete();
    await page.getByRole('status').filter({ hasText: '本次没有重复提交完成操作' }).waitFor();
    await page.getByRole('button', { name: '完成', exact: true }).waitFor();
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.deepEqual(await readState(), {
      deleteWrites: 0,
      completionWrites: 1,
      detailReads: 1,
      rows: [{ id: shooting.id, status: shooting.status }],
    });

    // If the PUT and first read-back are uncertain, writes stay locked; a reload retries GET only.
    await openFixture('completion-read-fails-once');
    await confirmComplete();
    await page.getByRole('alert').filter({ hasText: '请只读重试核实，不要重复提交完成操作。' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '添加制作计划' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '删除《隔离制作计划删除验收》' }).isDisabled(), true);
    assert.deepEqual(await readState(), {
      deleteWrites: 0,
      completionWrites: 1,
      detailReads: 1,
      rows: [{ id: shooting.id, status: 'completed' }],
    });
    await page.screenshot({ path: '/private/tmp/xmt-shooting-completion-pending-verification.png', fullPage: false });
    await page.reload();
    await page.getByText('进入发布管理').waitFor();
    await page.getByRole('alert').waitFor({ state: 'detached' });
    await page.getByText('已完成', { exact: true }).waitFor();
    await page.getByRole('button', { name: '完成', exact: true }).waitFor({ state: 'detached' });
    assert.deepEqual(await readState(), {
      deleteWrites: 0,
      completionWrites: 1,
      detailReads: 2,
      rows: [{ id: shooting.id, status: 'completed' }],
    });

    // A detail-page PUT may take effect despite a 503: the GET confirms it and the status is never resent.
    await openDetailFixture('detail-status-applied-after-error');
    await page.getByRole('button', { name: '完成制作' }).click();
    await page.getByText('服务器已确认状态更新', { exact: true }).waitFor();
    await page.getByText('已完成', { exact: true }).waitFor();
    assert.deepEqual(await readDetailState(), {
      detailStatusWrites: 1,
      detailReads: 2,
      rows: [{ id: shooting.id, status: 'completed' }],
    });
    await page.screenshot({ path: '/private/tmp/xmt-shooting-status-confirmed.png', fullPage: false });

    // If the status stayed unchanged, offer a deliberate retry but never replay it automatically.
    await openDetailFixture('detail-status-still-in-progress');
    await page.getByRole('button', { name: '完成制作' }).click();
    await page.getByRole('alert').filter({ hasText: '服务器仍为' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^确认后重试/ }).count(), 1);
    assert.deepEqual(await readDetailState(), {
      detailStatusWrites: 1,
      detailReads: 2,
      rows: [{ id: shooting.id, status: 'in_progress' }],
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal((await readDetailState()).detailStatusWrites, 1, 'no background retry is sent');
    await page.screenshot({ path: '/private/tmp/xmt-shooting-status-retry-ready.png', fullPage: false });
    await page.getByRole('button', { name: /^确认后重试/ }).click();
    await page.getByText('已完成', { exact: true }).waitFor();
    assert.deepEqual(await readDetailState(), {
      detailStatusWrites: 2,
      detailReads: 3,
      rows: [{ id: shooting.id, status: 'completed' }],
    });

    // A failed read-back stays locked across reload; the page performs GET-only recovery on return.
    await openDetailFixture('detail-status-read-fails-once');
    await page.getByRole('button', { name: '完成制作' }).click();
    await page.getByRole('alert').filter({ hasText: '只读核实状态' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '完成制作' }).isDisabled(), true);
    assert.deepEqual(await readDetailState(), {
      detailStatusWrites: 1,
      detailReads: 2,
      rows: [{ id: shooting.id, status: 'completed' }],
    });
    await page.screenshot({ path: '/private/tmp/xmt-shooting-status-read-pending.png', fullPage: false });
    await page.reload();
    await page.getByText('已完成', { exact: true }).waitFor();
    await page.getByTestId('shooting-status-pending-verification').waitFor({ state: 'detached' });
    assert.deepEqual(await readDetailState(), {
      detailStatusWrites: 1,
      detailReads: 3,
      rows: [{ id: shooting.id, status: 'completed' }],
    });
    assert.deepEqual(unexpectedErrors, [], `the shooting list renders without unexpected browser errors: ${unexpectedErrors.join(' | ')}`);
    assert.equal(expectedHttpErrors.length, 17, 'the only HTTP errors are the injected DELETE/PUT/read-back failures and expected 404 for a confirmed deletion');
    await page.screenshot({ path: '/private/tmp/xmt-shooting-delete-recovery-after-reload.png', fullPage: false });
    await page.screenshot({ path: '/private/tmp/xmt-shooting-completion-recovery-after-reload.png', fullPage: false });
    console.log('Shooting list and detail mutation recovery browser assertions passed. Screenshots include /private/tmp/xmt-shooting-status-confirmed.png, /private/tmp/xmt-shooting-status-retry-ready.png, and /private/tmp/xmt-shooting-status-read-pending.png.');
  } finally {
    await browser?.close();
    await closeFixture();
  }
}
