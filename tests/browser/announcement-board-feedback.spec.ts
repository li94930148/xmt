import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const existing = {
  id: 101,
  content: '保留的系统公告',
  type: 'announcement',
  pinned: true,
  creator_id: 901,
  creator_name: '公告验收',
  created_at: '2026-10-09T12:00:00+08:00',
  updated_at: '2026-10-09T12:00:00+08:00',
};
let announcements = [existing];
let nextId = 102;
let listRequests = 0;
let createRequests = 0;
let insertedCreateCount = 0;
let statusRequests = 0;
let deleteRequests = 0;
let failNextList = false;
let failNextListCount = 0;
let failNextDelete = false;
let failNextDeleteResponse = false;
let failNextCreateBeforeCommit = false;
let failNextCreateResponse = false;
let failNextStatus = false;
let denyNextStatus = false;
let createDelayMs = 0;
let deleteDelayMs = 0;
const createRequestResults = new Map<string, { id: number; payload: { content: string; type: string; pinned: boolean } }>();
const createRequestHistory: Array<{ requestId: string; payload: { content: string; type: string; pinned: boolean } }> = [];

async function dropSessionStorageWrite(page: import('playwright').Page, key: string) {
  await page.evaluate((markerKey) => {
    const storage = window.sessionStorage;
    const originalSetItem = Storage.prototype.setItem.bind(storage);
    Object.defineProperty(storage, 'setItem', {
      configurable: true,
      value: (candidateKey: string, value: string) => {
        if (candidateKey === markerKey) return;
        originalSetItem(candidateKey, value);
      },
    });
  }, key);
}

async function dropSessionStorageRemoval(page: import('playwright').Page, key: string) {
  await page.evaluate((markerKey) => {
    const storage = window.sessionStorage;
    const originalRemoveItem = Storage.prototype.removeItem.bind(storage);
    Object.defineProperty(storage, 'removeItem', {
      configurable: true,
      value: (candidateKey: string) => {
        if (candidateKey === markerKey) return;
        originalRemoveItem(candidateKey);
      },
    });
  }, key);
}

async function restoreSessionStorageWrite(page: import('playwright').Page) {
  await page.evaluate(() => {
    Reflect.deleteProperty(window.sessionStorage, 'setItem');
  });
}

async function restoreSessionStorageRemoval(page: import('playwright').Page) {
  await page.evaluate(() => {
    Reflect.deleteProperty(window.sessionStorage, 'removeItem');
  });
}

const app = express();
app.use(express.json());
app.get('/__qa', (_req, res) => res.type('html').send('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/browser/announcement-board-harness.tsx"></script></body></html>'));
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.post('/__qa/options', (req, res) => {
  if (typeof req.body?.failNextList === 'boolean') failNextList = req.body.failNextList;
  if (Number.isInteger(req.body?.failNextListCount) && req.body.failNextListCount >= 0) failNextListCount = req.body.failNextListCount;
  if (typeof req.body?.failNextDelete === 'boolean') failNextDelete = req.body.failNextDelete;
  if (typeof req.body?.failNextDeleteResponse === 'boolean') failNextDeleteResponse = req.body.failNextDeleteResponse;
  if (typeof req.body?.failNextCreateBeforeCommit === 'boolean') failNextCreateBeforeCommit = req.body.failNextCreateBeforeCommit;
  if (typeof req.body?.failNextCreateResponse === 'boolean') failNextCreateResponse = req.body.failNextCreateResponse;
  if (typeof req.body?.failNextStatus === 'boolean') failNextStatus = req.body.failNextStatus;
  if (typeof req.body?.denyNextStatus === 'boolean') denyNextStatus = req.body.denyNextStatus;
  if (Number.isFinite(req.body?.createDelayMs)) createDelayMs = Math.max(0, Number(req.body.createDelayMs));
  if (Number.isFinite(req.body?.deleteDelayMs)) deleteDelayMs = Math.max(0, Number(req.body.deleteDelayMs));
  if (req.body?.seedAnnouncement === true) {
    announcements = [{
      id: nextId++, content: '刷新恢复删除公告', type: 'announcement', pinned: false,
      creator_id: 901, creator_name: '公告验收', created_at: '2026-10-09T12:02:00+08:00', updated_at: '2026-10-09T12:02:00+08:00',
    }, ...announcements];
  }
  res.json({ ready: true });
});
app.get('/api/permissions/my', (_req, res) => res.json([]));
app.get('/api/announcements', (_req, res) => {
  listRequests += 1;
  if (failNextListCount > 0) {
    failNextListCount -= 1;
    res.status(503).json({ message: '隔离公告列表暂不可用' });
    return;
  }
  if (failNextList) {
    failNextList = false;
    res.status(503).json({ message: '隔离公告列表暂不可用' });
    return;
  }
  res.json({ data: announcements });
});
app.get('/api/announcements/create-request/:requestId', (req, res) => {
  statusRequests += 1;
  res.set('Cache-Control', 'no-store');
  if (failNextStatus) {
    failNextStatus = false;
    res.status(503).json({ message: '隔离公告创建状态暂不可用' });
    return;
  }
  if (denyNextStatus) {
    denyNextStatus = false;
    res.status(403).json({ message: '隔离公告状态核实无权限' });
    return;
  }
  const result = createRequestResults.get(req.params.requestId);
  if (!result) {
    res.json({ state: 'not_found' });
    return;
  }
  if (!announcements.some((item) => item.id === result.id)) {
    res.json({ state: 'deleted' });
    return;
  }
  res.json({ state: 'committed', announcementId: result.id });
});
app.post('/api/announcements', async (req, res) => {
  createRequests += 1;
  const requestId = String(req.body?.client_request_id ?? '');
  const payload = {
    content: String(req.body?.content ?? ''),
    type: String(req.body?.type ?? 'note'),
    pinned: Boolean(req.body?.pinned),
  };
  createRequestHistory.push({ requestId, payload });
  if (createDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, createDelayMs));
  if (failNextCreateBeforeCommit) {
    failNextCreateBeforeCommit = false;
    res.status(503).json({ message: '隔离公告创建未提交' });
    return;
  }
  const prior = createRequestResults.get(requestId);
  if (prior && JSON.stringify(prior.payload) !== JSON.stringify(payload)) {
    res.status(409).json({ message: '隔离公告请求编号冲突' });
    return;
  }
  let createdId: number;
  if (prior) {
    createdId = prior.id;
  } else {
    const now = '2026-10-09T12:01:00+08:00';
    const created = {
      id: nextId++,
      ...payload,
      creator_id: 901,
      creator_name: '公告验收',
      created_at: now,
      updated_at: now,
    };
    announcements = [created, ...announcements];
    insertedCreateCount += 1;
    createdId = created.id;
    createRequestResults.set(requestId, { id: created.id, payload });
  }
  if (failNextCreateResponse) {
    failNextCreateResponse = false;
    res.status(503).json({ message: '模拟服务端已提交但响应丢失' });
    return;
  }
  res.status(prior ? 200 : 201).json({ message: '公告创建成功', id: createdId, idempotent_replay: Boolean(prior) });
});
app.delete('/api/announcements/:id', async (req, res) => {
  deleteRequests += 1;
  if (deleteDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, deleteDelayMs));
  if (failNextDelete) {
    failNextDelete = false;
    res.status(503).json({ message: '隔离公告删除失败' });
    return;
  }
  announcements = announcements.filter((item) => item.id !== Number(req.params.id));
  if (failNextDeleteResponse) {
    failNextDeleteResponse = false;
    res.status(503).json({ message: '模拟服务端已提交但删除响应丢失' });
    return;
  }
  res.json({ message: '公告删除成功' });
});

const server = http.createServer(app);
const vite = await createViteServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: 'spa', logLevel: 'error' });
app.use(vite.middlewares);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;

if (process.env.XMT_ANNOUNCEMENT_QA_SERVE === '1') {
  console.log(`Isolated announcement board QA fixture: ${base}/__qa`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('503 (Service Unavailable)') || message.text().includes('403 (Forbidden)')) expectedHttpErrors.push(message.text());
    else errors.push(message.text());
  });

  failNextList = true;
  await page.goto(`${base}/__qa`);
  await page.getByText('公告列表不可用，请重新加载后再查看。', { exact: true }).waitFor();
  assert.equal(await page.getByText('暂无公告', { exact: true }).count(), 0, 'a failed initial read must not be presented as an empty board');
  const initialListRetry = page.getByRole('button', { name: '重新加载列表', exact: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await initialListRetry.boundingBox();
    assert.ok(bounds && bounds.height >= 40, `${width}px list retry meets the 40px touch target: ${JSON.stringify(bounds)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await initialListRetry.click();
  await page.getByText('保留的系统公告', { exact: true }).waitFor();
  assert.equal(listRequests, 2, 'initial error recovery is a read-only retry');
  const retainedAnnouncementDelete = page.getByRole('button', { name: '删除公告：保留的系统公告', exact: true });
  await page.setViewportSize({ width: 320, height: 844 });
  const mobileAnnouncementDelete = await retainedAnnouncementDelete.evaluate((button) => ({
    width: button.getBoundingClientRect().width,
    height: button.getBoundingClientRect().height,
    opacity: getComputedStyle(button).opacity,
  }));
  assert.ok(mobileAnnouncementDelete.width >= 40 && mobileAnnouncementDelete.height >= 40, `mobile delete action meets the 40×40px touch target: ${JSON.stringify(mobileAnnouncementDelete)}`);
  assert.equal(mobileAnnouncementDelete.opacity, '1', 'mobile delete action stays visible without hover');
  await page.setViewportSize({ width: 390, height: 844 });

  const addAnnouncementToggle = page.getByRole('button', { name: '添加公告', exact: true });
  assert.equal(await addAnnouncementToggle.getAttribute('aria-expanded'), 'false', 'the announcement form starts collapsed');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await addAnnouncementToggle.boundingBox();
    assert.ok(bounds && bounds.width >= 40 && bounds.height >= 40, `${width}px add-announcement toggle meets the 40×40px touch target: ${JSON.stringify(bounds)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await addAnnouncementToggle.click();
  const closeAnnouncementFormToggle = page.getByRole('button', { name: '关闭公告表单', exact: true });
  assert.equal(await closeAnnouncementFormToggle.getAttribute('aria-expanded'), 'true', 'opening the announcement form exposes its expanded state');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await closeAnnouncementFormToggle.boundingBox();
    assert.ok(bounds && bounds.width >= 40 && bounds.height >= 40, `${width}px close-announcement toggle meets the 40×40px touch target: ${JSON.stringify(bounds)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await closeAnnouncementFormToggle.click();
  const reopenedAnnouncementToggle = page.getByRole('button', { name: '添加公告', exact: true });
  assert.equal(await reopenedAnnouncementToggle.getAttribute('aria-expanded'), 'false', 'closing the announcement form exposes its collapsed state');
  await reopenedAnnouncementToggle.click();
  const reopenedAnnouncementFormToggle = page.getByRole('button', { name: '关闭公告表单', exact: true });
  assert.equal(await reopenedAnnouncementFormToggle.getAttribute('aria-expanded'), 'true', 'the announcement form can be reopened with its expanded state');
  const announcementContent = page.getByRole('textbox', { name: '公告内容', exact: true });
  assert.equal(await announcementContent.count(), 1, 'the new-announcement textarea has its visible accessible label');
  assert.equal(await announcementContent.getAttribute('id'), 'announcement-content', 'the announcement textarea has a stable id');
  assert.equal(await announcementContent.getAttribute('name'), 'content', 'the announcement textarea has a stable name');
  const announcementFormControls = [
    page.getByRole('button', { name: '便签', exact: true }),
    page.getByRole('button', { name: '公告', exact: true }),
    page.getByRole('button', { name: '重要', exact: true }),
    page.getByRole('button', { name: '置顶', exact: true }),
    page.getByRole('button', { name: '发布', exact: true }),
  ];
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const control of announcementFormControls) {
      const bounds = await control.boundingBox();
      assert.ok(bounds && bounds.height >= 40, `${width}px announcement control meets the 40px touch target: ${JSON.stringify(bounds)}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await announcementContent.fill('取消时不应发布的隔离草稿');
  await reopenedAnnouncementFormToggle.click();
  assert.equal(await createRequests, 0, 'closing the new-announcement form sends no create request');
  await page.getByRole('button', { name: '添加公告', exact: true }).click();
  const reopenedAnnouncementContent = page.getByRole('textbox', { name: '公告内容', exact: true });
  await reopenedAnnouncementContent.fill('恢复记录静默丢写时不得发布');
  await dropSessionStorageWrite(page, 'xmt:announcement-create-pending:v1:actor:901');
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.getByText('无法保存公告恢复编号，本次没有发送发布请求；请刷新页面后重试。', { exact: true }).waitFor();
  assert.equal(createRequests, 0, 'a silently dropped create recovery marker prevents the announcement POST');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:announcement-create-pending:v1:actor:901')), null, 'a failed create pre-write leaves no falsely verified recovery marker');
  await restoreSessionStorageWrite(page);
  await page.reload();
  await page.getByText('保留的系统公告', { exact: true }).waitFor();
  await page.getByRole('button', { name: '添加公告', exact: true }).click();
  const createAfterStorageRecovery = page.getByRole('textbox', { name: '公告内容', exact: true });
  await createAfterStorageRecovery.fill('新公告隔离记录');
  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ createDelayMs: 220, failNextList: true }) });
  });
  await page.getByRole('button', { name: '发布', exact: true }).dblclick();
  await page.getByText('服务端已确认公告发布，但公告列表暂未刷新；请重新加载列表确认，不要重复发布。', { exact: true }).waitFor();
  assert.equal(createRequests, 1, 'duplicate clicks issue one announcement create request');
  assert.equal(await page.getByText('保留的系统公告', { exact: true }).count(), 1, 'existing list rows remain when the post-create refresh fails');
  assert.equal(await page.getByText('新公告隔离记录', { exact: true }).count(), 0, 'the UI does not fabricate a local announcement row without server details');

  const postCreateReadCount = listRequests;
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('新公告隔离记录', { exact: true }).waitFor();
  assert.equal(listRequests, postCreateReadCount + 1, 'create recovery only reloads the list');
  assert.equal(createRequests, 1, 'read-only recovery never repeats the confirmed create');

  await page.getByRole('button', { name: '添加公告', exact: true }).click();
  await page.getByRole('textbox', { name: '公告内容', exact: true }).fill('恢复编号清理静默失败');
  await dropSessionStorageRemoval(page, 'xmt:announcement-create-pending:v1:actor:901');
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.getByText('公告已确认发布，但本地恢复记录暂时无法清理；操作仍保持锁定，请稍后重新核实。', { exact: true }).waitFor();
  assert.equal(createRequests, 2, 'a confirmed announcement is created once when local recovery-marker cleanup silently fails');
  assert(await page.evaluate(() => sessionStorage.getItem('xmt:announcement-create-pending:v1:actor:901')), 'a silently retained recovery marker keeps the create operation locked');
  await restoreSessionStorageRemoval(page);
  await page.reload();
  await page.getByText('公告已发布。', { exact: true }).waitFor();
  assert.equal(createRequests, 2, 'refresh clears the retained marker by read-only status verification without repeating the POST');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:announcement-create-pending:v1:actor:901')), null, 'verified read-only recovery clears the retained marker');
  await page.getByText('恢复编号清理静默失败', { exact: true }).waitFor();

  const createdDeleteButton = page.getByRole('button', { name: '删除公告：新公告隔离记录' });
  await createdDeleteButton.click();
  await page.getByRole('heading', { name: '确认删除公告？' }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(deleteRequests, 0, 'canceling the destructive confirmation sends no delete request');

  await page.getByRole('button', { name: '删除公告：新公告隔离记录' }).click();
  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleteDelayMs: 220, failNextDelete: true }) });
  });
  const readsBeforeRejectedDelete = listRequests;
  await page.getByRole('button', { name: '删除公告', exact: true }).dblclick();
  await page.getByText('只读核实发现该公告仍存在；未自动重试，请在确认框中再次确认后再删除。', { exact: true }).waitFor();
  assert.equal(deleteRequests, 1, 'a failed delete double-click issues one request');
  assert.equal(listRequests, readsBeforeRejectedDelete + 1, 'an ambiguous delete failure is reconciled with one read-only list request');
  assert.equal(await page.locator('[aria-label="删除公告：新公告隔离记录"]').count(), 1, 'failed delete keeps the announcement row');
  assert.equal(await page.getByRole('heading', { name: '确认删除公告？' }).count(), 1, 'failed delete keeps its confirmation available for explicit retry');
  await page.getByText('只读核实发现公告仍存在；本次未自动重试。如仍要删除，请再次确认。', { exact: true }).waitFor();

  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextList: true }) });
  });
  await page.getByRole('button', { name: '删除公告', exact: true }).click();
  await page.getByText('服务端已确认删除公告，但公告列表暂未刷新；请重新加载列表确认，不要重复删除。', { exact: true }).waitFor();
  assert.equal(deleteRequests, 2, 'the explicit retry confirms deletion exactly once');
  assert.equal(await page.getByRole('heading', { name: '确认删除公告？' }).count(), 0, 'confirmed deletion closes the destructive confirmation');
  assert.equal(await page.getByRole('button', { name: '删除公告：新公告隔离记录' }).count(), 0, 'confirmed deletion immediately removes the current row');
  const postDeleteReadCount = listRequests;
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await page.getByText('公告列表已重新加载，先前操作已确认。', { exact: true }).waitFor();
  assert.equal(listRequests, postDeleteReadCount + 1, 'delete recovery only reloads the list');
  assert.equal(deleteRequests, 2, 'read-only recovery never repeats the confirmed delete');

  await page.getByRole('button', { name: '删除公告：保留的系统公告' }).click();
  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextDeleteResponse: true }) });
  });
  const deletesBeforeLostResponse = deleteRequests;
  await page.getByRole('button', { name: '删除公告', exact: true }).click();
  await page.getByText('只读核实发现该公告当前已不存在；无法确认是否由本次删除完成，未重发删除请求。', { exact: true }).waitFor();
  assert.equal(deleteRequests, deletesBeforeLostResponse + 1, 'commit-then-drop is reconciled without a second DELETE');
  assert.equal(await page.locator('[aria-label="删除公告：保留的系统公告"]').count(), 0, 'a GET-confirmed absent announcement is removed from the view');

  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seedAnnouncement: true }) });
  });
  await page.reload();
  await page.getByText('刷新恢复删除公告', { exact: true }).waitFor();
  await page.getByRole('button', { name: '删除公告：刷新恢复删除公告' }).click();
  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextDeleteResponse: true, failNextListCount: 3 }) });
  });
  const deletesBeforeRefreshRecovery = deleteRequests;
  await page.getByRole('button', { name: '删除公告', exact: true }).click();
  await page.getByText('暂时无法核实公告删除状态；公告写入已锁定，只能重新核实，请勿重复删除。', { exact: true }).waitFor();
  assert.equal(deleteRequests, deletesBeforeRefreshRecovery + 1, 'a failed first GET never triggers another DELETE');
  assert(await page.evaluate(() => sessionStorage.getItem('xmt:announcement-delete-pending:v1:actor:901')), 'ambiguous deletion is persisted by actor and announcement ID');
  await page.reload();
  await page.getByText('暂时无法核实公告删除状态；公告写入已锁定，只能重新核实，请勿重复删除。', { exact: true }).waitFor();
  assert.equal(deleteRequests, deletesBeforeRefreshRecovery + 1, 'refresh recovery performs only GETs');
  const verifyDeleteButton = page.getByRole('button', { name: '重新核实公告删除状态', exact: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await verifyDeleteButton.boundingBox();
    assert.ok(bounds && bounds.height >= 40, `${width}px delete verification meets the 40px touch target: ${JSON.stringify(bounds)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await verifyDeleteButton.click();
  await page.getByText('只读核实发现该公告当前已不存在；无法确认是否由本次删除完成，未重发删除请求。', { exact: true }).waitFor();
  assert.equal(deleteRequests, deletesBeforeRefreshRecovery + 1, 'manual verification after refresh remains read-only');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:announcement-delete-pending:v1:actor:901')), null, 'confirmed absent target clears its recovery marker');

  await page.getByRole('button', { name: '添加公告' }).click();
  await page.getByPlaceholder('输入公告内容...').fill('响应丢失后刷新核实');
  const insertedBeforeLostResponse = insertedCreateCount;
  const writesBeforeLostResponse = createRequests;
  const statusReadsBeforeLostResponse = statusRequests;
  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextCreateResponse: true, failNextStatus: true }) });
  });
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.getByText('暂时无法核实公告创建状态；操作已锁定，请稍后重新核实，不要重复发布。', { exact: true }).waitFor();
  const verifyCreateButton = page.getByRole('button', { name: '重新核实发布状态', exact: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await verifyCreateButton.boundingBox();
    assert.ok(bounds && bounds.height >= 40, `${width}px create verification meets the 40px touch target: ${JSON.stringify(bounds)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(createRequests, writesBeforeLostResponse + 1, 'an ambiguous response never automatically retries the create');
  assert.equal(statusRequests, statusReadsBeforeLostResponse + 1, 'ambiguous response is followed by one read-only verification');
  assert.equal(insertedCreateCount, insertedBeforeLostResponse + 1, 'fixture committed exactly one announcement before losing the response');
  assert(await page.evaluate(() => sessionStorage.getItem('xmt:announcement-create-pending:v1:actor:901')), 'pending marker survives until the result is verified');
  const writesBeforeReload = createRequests;
  await page.reload();
  await page.getByText('公告已发布。', { exact: true }).waitFor();
  assert.equal(createRequests, writesBeforeReload, 'refresh restores by GET-only status verification');
  assert.equal(statusRequests, statusReadsBeforeLostResponse + 2, 'refresh recovery adds exactly one status GET');
  assert.equal(insertedCreateCount, insertedBeforeLostResponse + 1, 'refresh recovery does not duplicate the committed announcement');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:announcement-create-pending:v1:actor:901')), null, 'confirmed result clears its session marker');

  await page.getByRole('button', { name: '添加公告' }).click();
  await page.getByPlaceholder('输入公告内容...').fill('明确未创建后显式重试');
  const retryHistoryStart = createRequestHistory.length;
  const insertedBeforeExplicitRetry = insertedCreateCount;
  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextCreateBeforeCommit: true }) });
  });
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.getByRole('button', { name: '确认未创建，使用原编号重试', exact: true }).waitFor();
  assert.equal(createRequestHistory.length, retryHistoryStart + 1, 'not_found does not retry automatically');
  const explicitCreateRetry = page.getByRole('button', { name: '确认未创建，使用原编号重试', exact: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await explicitCreateRetry.boundingBox();
    assert.ok(bounds && bounds.height >= 40, `${width}px explicit create retry meets the 40px touch target: ${JSON.stringify(bounds)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const firstAttempt = createRequestHistory[retryHistoryStart];
  await explicitCreateRetry.click();
  await page.getByText('公告已发布。', { exact: true }).waitFor();
  assert.equal(createRequestHistory.length, retryHistoryStart + 2, 'one explicit retry issues one additional POST');
  assert.equal(createRequestHistory[retryHistoryStart + 1].requestId, firstAttempt.requestId, 'explicit retry preserves the original request ID');
  assert.deepEqual(createRequestHistory[retryHistoryStart + 1].payload, firstAttempt.payload, 'explicit retry preserves the exact original payload');
  assert.equal(insertedCreateCount, insertedBeforeExplicitRetry + 1, 'explicit retry creates exactly one announcement');

  await page.getByRole('button', { name: '添加公告' }).click();
  await page.getByPlaceholder('输入公告内容...').fill('权限异常时继续锁定');
  const writesBeforeDeniedStatus = createRequests;
  await page.evaluate(async () => {
    await fetch('/__qa/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ failNextCreateBeforeCommit: true, denyNextStatus: true }) });
  });
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.getByText('暂时无法核实公告创建状态；公告操作已锁定，请稍后重新核实，不要重复发布。', { exact: true }).waitFor();
  assert.equal(createRequests, writesBeforeDeniedStatus + 1, 'permission failure during verification does not trigger another POST');
  assert.equal(await page.getByRole('button', { name: '确认未创建，使用原编号重试', exact: true }).count(), 0, 'a permission error is not treated as not_found');
  await page.getByRole('button', { name: '重新核实发布状态', exact: true }).click();
  await page.getByRole('button', { name: '确认未创建，使用原编号重试', exact: true }).waitFor();
  assert.equal(createRequests, writesBeforeDeniedStatus + 1, 'later verification is also read-only until explicit retry');

  await page.goto(`${base}/__qa?role=editor`);
  await page.getByText('保留的系统公告', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '添加公告' }).count(), 0, 'users without system:announcement do not see create controls');
  assert.equal(await page.getByRole('button', { name: /删除公告/ }).count(), 0, 'users without system:announcement do not see delete controls');
  assert.equal(expectedHttpErrors.length, 16, 'only the deliberately injected status/create/delete/list failures produce expected HTTP errors');
  assert.deepEqual(errors, [], 'announcement board has no browser runtime or unexpected console errors');
  await context.close();
  console.log('Announcement board browser test passed: initial read retry, create/delete confirmation, duplicate-write protection, ambiguous delete recovery, confirmed-write recovery and permission-scoped controls at 390px.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
