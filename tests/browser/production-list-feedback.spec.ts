import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { chromium, type Route } from 'playwright';
import { createServer as createViteServer } from 'vite';

const version = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
const editor = { id: 96, username: 'production-list-qa', role: 'editor', name: '创作列表验收', enabled: true, force_change_password: false };
const topics = [{ id: 961, title: '创作列表反馈验收选题', status: 'approved', creator_id: editor.id, assignee_id: editor.id }];
type FixtureProduction = {
  id: number;
  topic_id: number;
  version: string;
  content: string;
  content_json: string | null;
  content_markdown: string | null;
  status: string;
  file_path: string;
  operator_id: number | null;
  operator_name: string;
  topic_title: string;
  topic_status: string;
  created_at: string;
  updated_at: string;
};
const originalProduction: FixtureProduction = {
  id: 962,
  topic_id: topics[0].id,
  version: 'v1.0',
  content: '原始稿件内容',
  content_json: '原始稿件内容',
  content_markdown: '原始稿件内容',
  status: 'draft',
  file_path: '',
  operator_id: editor.id,
  operator_name: editor.name,
  topic_title: '创作列表反馈验收选题',
  topic_status: 'approved',
  created_at: '2026-10-09 09:00:00',
  updated_at: '2026-10-09 09:00:00',
};
let productions: FixtureProduction[] = [{ ...originalProduction }];
let createWrites = 0;
const productionCreateRequests = new Map<string, { fingerprint: string; productionId: number }>();
const productionCreateRequestIds: string[] = [];
let updateWrites = 0;
let failNextProductionUpdateWithoutCommit = false;
let commitNextProductionUpdateAndFail = false;
let failNextProductionDetailRead = false;
let failNextProductionListRead = false;
let changeNextProductionDetailRead: Partial<FixtureProduction> | null = null;
let productionDetailReadAttempts = 0;
let qaProductionListEnabled = false;
let productionTotalOverride: number | null = null;
const mutationDelayMs = 180;
const app = express();
app.use(express.json());
app.get('/__qa-production', (req, res) => {
  qaProductionListEnabled = true;
  const theme = req.query.theme === 'light' ? 'light' : 'dark';
  res.type('html').send(`<script>localStorage.setItem('xmt_user',${JSON.stringify(JSON.stringify(editor))});localStorage.setItem('xmt_token','production-list-fixture');localStorage.setItem('xmt_theme',${JSON.stringify(theme)});localStorage.setItem('xmt_last_version_seen',${JSON.stringify(version)});location.replace('/production');</script>`);
});
app.get('/api/auth/me', (_req, res) => res.json(editor));
app.get('/api/messages/unread', (_req, res) => res.json({ unreadCount: 0 }));
app.get(['/api/system-settings', '/api/system-settings/public'], (_req, res) => res.json({ version }));
app.get('/api/permissions/my', (_req, res) => res.json(['topic:create', 'production:update']));
app.get('/api/topics', (req, res) => {
  const data = topics.filter((topic) => !req.query.status || topic.status === req.query.status);
  const limit = Number(req.query.limit) || 10;
  res.json({ success: true, data: data.slice(0, limit), pagination: { total: data.length, page: 1, limit } });
});
app.get('/api/workflow/production', (req, res) => {
  if (!qaProductionListEnabled || req.query.page === undefined) {
    return res.json({ data: [], total: 0, page: 1, limit: 12 });
  }
  if (failNextProductionListRead) {
    failNextProductionListRead = false;
    return res.status(503).json({ message: '隔离验收：确认写入后的列表读取失败' });
  }
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  return res.json({ data: productions.slice((page - 1) * limit, page * limit), total: productionTotalOverride ?? productions.length, page, limit });
});
app.get('/api/workflow/production/:id', (req, res) => {
  productionDetailReadAttempts += 1;
  if (failNextProductionDetailRead) {
    failNextProductionDetailRead = false;
    return res.status(503).json({ message: '隔离验收：创作详情只读核实失败' });
  }
  const production = productions.find((item) => item.id === Number(req.params.id));
  if (!production) return res.status(404).json({ message: '创作记录不存在' });
  if (changeNextProductionDetailRead) {
    Object.assign(production, changeNextProductionDetailRead);
    changeNextProductionDetailRead = null;
  }
  return res.json(production);
});
app.post('/__qa-production/fail-next-production-update-without-commit', (_req, res) => {
  failNextProductionUpdateWithoutCommit = true;
  return res.json({ ok: true });
});
app.post('/__qa-production/commit-next-production-update-and-fail', (_req, res) => {
  commitNextProductionUpdateAndFail = true;
  return res.json({ ok: true });
});
app.post('/__qa-production/fail-next-production-detail-read', (_req, res) => {
  failNextProductionDetailRead = true;
  return res.json({ ok: true });
});
app.post('/__qa-production/fail-next-production-list-read', (_req, res) => {
  failNextProductionListRead = true;
  return res.json({ ok: true });
});
app.post('/__qa-production/change-next-production-detail-read', (req, res) => {
  changeNextProductionDetailRead = req.body as Partial<FixtureProduction>;
  return res.json({ ok: true });
});
app.post('/__qa-production/set-production-operator-null/:id', (req, res) => {
  const production = productions.find((item) => item.id === Number(req.params.id));
  if (!production) return res.status(404).json({ message: '创作记录不存在' });
  production.operator_id = null;
  return res.json({ ok: true });
});
app.get('/api/workflow/production/create-request/:requestId', (req, res) => {
  const request = productionCreateRequests.get(String(req.params.requestId).toLowerCase());
  if (!request) return res.status(404).json({ message: '尚未找到对应创作记录' });
  return res.json({ productionId: request.productionId });
});
app.get('/__qa-production/room-members', (_req, res) => {
  res.json({ count: io.sockets.adapter.rooms.get('production')?.size ?? 0 });
});
app.post('/__qa-production/emit-created', (_req, res) => {
  io.to('production').emit('production:created', { id: 964 });
  res.sendStatus(202);
});
app.post('/__qa-production/emit-updated', (_req, res) => {
  io.to('production').emit('production:updated', {
    id: 973,
    version: '事件更新版本',
    topic_title: '事件更新后的选题',
  });
  res.sendStatus(202);
});
app.post('/__qa-production/emit-deleted', (req, res) => {
  const id = Number(req.query.id) || 973;
  io.to('production').emit('production:deleted', { id });
  res.sendStatus(202);
});
app.post('/__qa-production/set-total', (req, res) => {
  productionTotalOverride = Number(req.query.total) || null;
  res.sendStatus(204);
});
app.post('/api/workflow/production', async (req, res) => {
  if (!qaProductionListEnabled) return res.status(404).json({ message: '未启用隔离创作列表夹具' });
  const rawRequestId = req.body?.client_request_id;
  const requestId = typeof rawRequestId === 'string' ? rawRequestId.toLowerCase() : '';
  const fingerprint = JSON.stringify([Number(req.body?.topic_id), req.body?.version ?? null, req.body?.content ?? null, String(req.body?.status ?? 'draft')]);
  if (requestId) {
    productionCreateRequestIds.push(requestId);
    const previous = productionCreateRequests.get(requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return res.status(409).json({ message: '请求编号对应的内容不一致' });
      return res.status(200).json({ message: '创作记录已添加', productionId: previous.productionId, idempotent_replay: true });
    }
  }
  createWrites += 1;
  const createdId = 962 + createWrites;
  const topic = topics.find((item) => item.id === Number(req.body?.topic_id));
  const created: FixtureProduction = {
    ...originalProduction,
    id: createdId,
    topic_id: Number(req.body?.topic_id),
    version: String(req.body?.version ?? ''),
    content: String(req.body?.content ?? ''),
    status: String(req.body?.status ?? 'draft'),
    topic_title: topic?.title ?? '未知选题',
    created_at: '2026-10-09 10:00:00',
    updated_at: '2026-10-09 10:00:00',
  };
  productions = [created, ...productions.filter((production) => production.id !== created.id)];
  if (requestId) productionCreateRequests.set(requestId, { fingerprint, productionId: created.id });
  io.to('production').emit('production:created', { id: created.id, topic_id: created.topic_id });
  await new Promise((resolve) => setTimeout(resolve, mutationDelayMs));
  return res.status(201).json({ message: '创作记录已添加', productionId: created.id });
});
app.put('/api/workflow/production/:id', async (req, res) => {
  if (!qaProductionListEnabled) return res.status(404).json({ message: '未启用隔离创作列表夹具' });
  updateWrites += 1;
  const id = Number(req.params.id);
  const production = productions.find((item) => item.id === id);
  if (!production) return res.status(404).json({ message: '创作记录不存在' });
  if (failNextProductionUpdateWithoutCommit) {
    failNextProductionUpdateWithoutCommit = false;
    return res.status(503).json({ message: '隔离验收：创作修改未提交，响应不确定' });
  }
  Object.assign(production, {
    topic_id: Number(req.body?.topic_id),
    version: String(req.body?.version ?? production.version),
    content: String(req.body?.content ?? production.content),
    content_json: String(req.body?.content ?? production.content),
    content_markdown: String(req.body?.content ?? production.content),
    status: String(req.body?.status ?? production.status),
    operator_id: editor.id,
    operator_name: editor.name,
    updated_at: '2026-10-09 10:30:00',
  });
  if (commitNextProductionUpdateAndFail) {
    commitNextProductionUpdateAndFail = false;
    return res.status(503).json({ message: '隔离验收：创作修改已提交但响应丢失' });
  }
  io.to('production').emit('production:updated', { id });
  await new Promise((resolve) => setTimeout(resolve, mutationDelayMs));
  return res.json({ message: '创作记录已更新' });
});
app.use('/api', (_req, res) => res.json({ success: true, data: [], total: 0, page: 1, limit: 20 }));

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

if (process.env.XMT_PRODUCTION_LIST_FEEDBACK_QA_SERVE === '1') {
  console.log(`Isolated production list feedback fixture: ${base}/__qa-production`);
  await new Promise(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  const expectedConsoleErrors: string[] = [];
  const expectedHttpErrors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/\b(404|503)\b/.test(message.text())) expectedConsoleErrors.push(message.text());
    else errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const description = `${response.request().method()} ${response.status()} ${response.url()}`;
    if (response.url().includes('/api/workflow/production') && [404, 503].includes(response.status())) expectedHttpErrors.push(description);
    else errors.push(`Unexpected HTTP error: ${description}`);
  });

  await page.goto(`${base}/__qa-production?theme=light`);
  await page.getByRole('heading', { name: '创作管理' }).waitFor();
  await page.getByText(originalProduction.topic_title, { exact: true }).waitFor();
  const desktopProductionActions = await page.locator('tbody tr').filter({ hasText: originalProduction.topic_title }).locator('td').last().locator('button[aria-label]').evaluateAll((actions) => actions.map((action) => {
    const rect = action.getBoundingClientRect();
    return { label: action.getAttribute('aria-label') || '', width: rect.width, height: rect.height, top: rect.top };
  }));
  assert.equal(desktopProductionActions.length, 2, 'the desktop production row exposes view and edit actions');
  for (const action of desktopProductionActions) {
    assert.ok(action.width >= 40 && action.height >= 40, `${action.label} has a 40px desktop target: ${JSON.stringify(action)}`);
  }
  assert.ok(Math.max(...desktopProductionActions.map((action) => action.top)) - Math.min(...desktopProductionActions.map((action) => action.top)) <= 1,
    `desktop production actions remain on one line: ${JSON.stringify(desktopProductionActions)}`);

  type HeldProductionRead = { page: number; respond: (status: number, data?: FixtureProduction[], total?: number) => Promise<void> };
  const heldProductionReads: HeldProductionRead[] = [];
  const heldReadWaiters: Array<{ count: number; resolve: () => void }> = [];
  const waitForHeldProductionReads = (count: number) => new Promise<void>((resolve, reject) => {
    if (heldProductionReads.length >= count) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for held production reads: expected ${count}, received ${heldProductionReads.length}`));
    }, 15_000);
    heldReadWaiters.push({ count, resolve: () => {
      clearTimeout(timeout);
      resolve();
    } });
  });
  const emitProductionCreated = async () => {
    const response = await fetch(`${base}/__qa-production/emit-created`, { method: 'POST' });
    assert.equal(response.status, 202, 'the isolated fixture emits a production:created event');
  };
  const emitProductionEvent = async (event: 'updated' | 'deleted', productionId?: number) => {
    const url = new URL(`${base}/__qa-production/emit-${event}`);
    if (productionId !== undefined) url.searchParams.set('id', String(productionId));
    const response = await fetch(url, { method: 'POST' });
    assert.equal(response.status, 202, `the isolated fixture emits a production:${event} event`);
  };
  await page.waitForFunction(async () => {
    const response = await fetch('/__qa-production/room-members');
    const result = await response.json() as { count: number };
    return result.count > 0;
  });
  let releaseCreatePost!: () => void;
  let nextCreatePostGate: Promise<void> | null = null;
  const holdProductionListRoute = async (route: Route) => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() === 'POST' && requestUrl.pathname === '/api/workflow/production' && nextCreatePostGate) {
      const gate = nextCreatePostGate;
      nextCreatePostGate = null;
      await gate;
      await route.continue();
      return;
    }
    if (route.request().method() !== 'GET' || !requestUrl.searchParams.has('page')) {
      await route.continue();
      return;
    }
    let finish!: () => void;
    const heldRead: HeldProductionRead = {
      page: Number(requestUrl.searchParams.get('page')) || 1,
      respond: async (status, data = [], total = data.length) => {
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(status >= 400 ? { message: '隔离验收：迟到的实时列表读取失败' } : {
            data,
            total,
            page: Number(requestUrl.searchParams.get('page')) || 1,
            limit: Number(requestUrl.searchParams.get('limit')) || 20,
          }),
        });
        finish();
      },
    };
    heldProductionReads.push(heldRead);
    for (let index = heldReadWaiters.length - 1; index >= 0; index -= 1) {
      if (heldProductionReads.length >= heldReadWaiters[index].count) {
        heldReadWaiters.splice(index, 1)[0].resolve();
      }
    }
    await new Promise<void>((resolve) => { finish = resolve; });
  };
  await page.route('**/api/workflow/production**', holdProductionListRoute);

  const firstStaleSuccess = { ...originalProduction, id: 970, version: '迟到成功结果', topic_title: '迟到成功结果选题' };
  const latestSuccess = { ...originalProduction, id: 971, version: '较新成功结果', topic_title: '较新成功结果选题' };
  const firstRaceStart = heldProductionReads.length;
  await emitProductionCreated();
  await waitForHeldProductionReads(firstRaceStart + 1);
  await emitProductionCreated();
  await waitForHeldProductionReads(firstRaceStart + 2);
  await heldProductionReads[firstRaceStart + 1].respond(200, [latestSuccess], 41);
  await page.getByText('较新成功结果选题', { exact: true }).waitFor();
  await page.getByText('共 41 条', { exact: false }).waitFor();
  await heldProductionReads[firstRaceStart].respond(200, [firstStaleSuccess], 3);
  await page.waitForFunction(() => {
    const body = document.querySelector('tbody')?.innerText ?? '';
    const footer = document.body.innerText;
    const loading = Boolean(document.querySelector('tbody .animate-spin'));
    return body.includes('较新成功结果') && !body.includes('迟到成功结果') && footer.includes('共 41 条') && !loading;
  });
  assert.equal(await page.getByRole('alert').count(), 0, 'a late successful socket response cannot introduce an error');
  assert.equal(await page.getByRole('button', { name: '下一页' }).isDisabled(), false, 'the latest successful response controls pagination loading and total');

  const secondLatestSuccess = { ...originalProduction, id: 973, version: '较新成功结果二', topic_title: '较新成功结果选题二' };
  const secondRaceStart = heldProductionReads.length;
  await emitProductionCreated();
  await waitForHeldProductionReads(secondRaceStart + 1);
  await emitProductionCreated();
  await waitForHeldProductionReads(secondRaceStart + 2);
  await heldProductionReads[secondRaceStart + 1].respond(200, [secondLatestSuccess], 42);
  await page.getByText('较新成功结果选题二', { exact: true }).waitFor();
  await heldProductionReads[secondRaceStart].respond(503, undefined, 0);
  await page.waitForFunction(() => {
    const body = document.querySelector('tbody')?.innerText ?? '';
    const footer = document.body.innerText;
    const loading = Boolean(document.querySelector('tbody .animate-spin'));
    return body.includes('较新成功结果二') && footer.includes('共 42 条') && !loading;
  });
  assert.equal(await page.getByRole('alert').count(), 0, 'a late 503 cannot replace the latest successful refresh with an error');
  assert.equal(await page.getByRole('button', { name: '下一页' }).isDisabled(), false, 'a late 503 cannot change latest pagination loading state or total');

  const loadingRaceStart = heldProductionReads.length;
  await emitProductionCreated();
  await waitForHeldProductionReads(loadingRaceStart + 1);
  await emitProductionCreated();
  await waitForHeldProductionReads(loadingRaceStart + 2);
  await heldProductionReads[loadingRaceStart].respond(200, [firstStaleSuccess], 3);
  await page.waitForFunction(() => Boolean(document.querySelector('tbody .animate-spin')));
  assert.equal(await page.getByRole('button', { name: '下一页' }).isDisabled(), true, 'a stale request cannot clear loading while the latest request remains pending');
  assert.equal(await page.getByRole('alert').count(), 0, 'an obsolete successful read does not set an error');
  await heldProductionReads[loadingRaceStart + 1].respond(200, [secondLatestSuccess], 42);
  await page.getByText('较新成功结果选题二', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('tbody .animate-spin'));
  assert.equal(await page.getByRole('button', { name: '下一页' }).isDisabled(), false, 'the latest request releases loading and restores pagination');

  const updatedProduction = { ...secondLatestSuccess, version: '事件更新版本', topic_title: '事件更新后的选题' };
  const updateRaceStart = heldProductionReads.length;
  await emitProductionCreated();
  await waitForHeldProductionReads(updateRaceStart + 1);
  await emitProductionEvent('updated');
  await waitForHeldProductionReads(updateRaceStart + 2);
  await heldProductionReads[updateRaceStart + 1].respond(200, [updatedProduction], 42);
  await page.getByText('事件更新后的选题', { exact: true }).waitFor();
  await heldProductionReads[updateRaceStart].respond(200, [secondLatestSuccess], 42);
  await page.waitForFunction(() => {
    const body = document.querySelector('tbody')?.innerText ?? '';
    const footer = document.body.innerText;
    return body.includes('事件更新后的选题') && !body.includes('较新成功结果选题二') && footer.includes('共 42 条') && !document.querySelector('tbody .animate-spin');
  });

  const deleteRaceStart = heldProductionReads.length;
  await emitProductionCreated();
  await waitForHeldProductionReads(deleteRaceStart + 1);
  await emitProductionEvent('deleted');
  await waitForHeldProductionReads(deleteRaceStart + 2);
  await heldProductionReads[deleteRaceStart + 1].respond(200, [], 41);
  await page.getByText('共 41 条', { exact: false }).waitFor();
  await heldProductionReads[deleteRaceStart].respond(200, [updatedProduction], 42);
  await page.waitForFunction(() => {
    const body = document.querySelector('tbody')?.innerText ?? '';
    const footer = document.body.innerText;
    return !body.includes('事件更新后的选题') && footer.includes('共 41 条') && !document.querySelector('tbody .animate-spin');
  });
  assert.equal(await page.getByRole('alert').count(), 0, 'updated/deleted events do not surface errors from superseded reads');

  const pageTotalResponse = await fetch(`${base}/__qa-production/set-total?total=42`, { method: 'POST' });
  assert.equal(pageTotalResponse.status, 204);
  const pageTwoStale = { ...originalProduction, id: 974, version: '旧第二页快照', topic_title: '旧第二页快照选题' };
  const pageTwoLatest = { ...originalProduction, id: 975, version: '最新第二页快照', topic_title: '最新第二页选题' };
  const pageTwoReadStart = heldProductionReads.length;
  await page.getByRole('button', { name: '下一页' }).click();
  await waitForHeldProductionReads(pageTwoReadStart + 1);
  assert.equal(heldProductionReads[pageTwoReadStart].page, 2, 'pagination requests the selected second page');
  await emitProductionCreated();
  await waitForHeldProductionReads(pageTwoReadStart + 2);
  assert.equal(heldProductionReads[pageTwoReadStart + 1].page, 2, 'created refresh uses the current page after pagination');
  await heldProductionReads[pageTwoReadStart + 1].respond(200, [pageTwoLatest], 42);
  await page.getByText('最新第二页选题', { exact: true }).waitFor();
  await heldProductionReads[pageTwoReadStart].respond(200, [pageTwoStale], 41);
  await page.waitForFunction(() => {
    const body = document.querySelector('tbody')?.innerText ?? '';
    const footer = document.body.innerText;
    return body.includes('最新第二页选题') && !body.includes('旧第二页快照') && footer.includes('共 42 条') && footer.includes('第 2 / 3 页') && !document.querySelector('tbody .animate-spin');
  });
  const pageOneReadStart = heldProductionReads.length;
  await page.getByRole('button', { name: '上一页' }).click();
  await waitForHeldProductionReads(pageOneReadStart + 1);
  assert.equal(heldProductionReads[pageOneReadStart].page, 1, 'returning to the first page requests page one');
  await heldProductionReads[pageOneReadStart].respond(200, [originalProduction], 42);
  await page.getByText(originalProduction.topic_title, { exact: true }).waitFor();

  const setLastPageTotal = await fetch(`${base}/__qa-production/set-total?total=21`, { method: 'POST' });
  assert.equal(setLastPageTotal.status, 204);
  const lastPageProduction = { ...originalProduction, id: 976, topic_title: '待删除末页唯一记录' };
  const lastPageReadStart = heldProductionReads.length;
  await page.getByRole('button', { name: '下一页' }).click();
  await waitForHeldProductionReads(lastPageReadStart + 1);
  assert.equal(heldProductionReads[lastPageReadStart].page, 2, 'a 21-record list has a second page');
  await heldProductionReads[lastPageReadStart].respond(200, [lastPageProduction], 21);
  await page.getByText('待删除末页唯一记录', { exact: true }).waitFor();
  const deleteLastPageReadStart = heldProductionReads.length;
  await emitProductionEvent('deleted', lastPageProduction.id);
  await page.getByText('共 20 条', { exact: false }).waitFor();
  await waitForHeldProductionReads(deleteLastPageReadStart + 1);
  assert.equal(heldProductionReads[deleteLastPageReadStart].page, 1, 'deleting the only row on the last page immediately requests the preceding valid page');
  await heldProductionReads[deleteLastPageReadStart].respond(200, [originalProduction], 20);
  await page.waitForFunction(() => {
    const footer = document.body.innerText;
    const body = document.querySelector('tbody')?.innerText ?? '';
    return footer.includes('共 20 条') && footer.includes('第 1 / 1 页') && body.includes('创作列表反馈验收选题') && !body.includes('待删除末页唯一记录') && !document.querySelector('tbody .animate-spin');
  });
  assert.equal(await page.getByRole('button', { name: '下一页' }).isDisabled(), true, 'the corrected last page leaves no invalid next-page state');
  await page.unroute('**/api/workflow/production**', holdProductionListRoute);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.getByRole('button', { name: '添加创作' }).click();
  const lightCreateDialog = page.getByRole('dialog', { name: '添加创作记录' });
  await lightCreateDialog.waitFor();
  assert.equal(await lightCreateDialog.getAttribute('aria-modal'), 'true', 'create modal exposes dialog semantics');
  const lightCreatePanel = page.locator('.xmt-overlay > div').first();
  const lightCreateLayout = await lightCreatePanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const content = element.querySelector('.max-h-\\[min\\(70vh\\,calc\\(100dvh-12rem\\)\\)\\]');
    const surface = getComputedStyle(element).backgroundColor;
    const probe = document.createElement('span');
    element.append(probe);
    probe.style.backgroundColor = 'var(--xmt-surface)';
    const tokenSurface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, surface, tokenSurface, contentOverflowY: content ? getComputedStyle(content).overflowY : '' };
  });
  assert.ok(lightCreateLayout.left >= 0 && lightCreateLayout.right <= 320 && lightCreateLayout.top >= 0 && lightCreateLayout.bottom <= 568, `light create modal stays within the 320x568 viewport: ${JSON.stringify(lightCreateLayout)}`);
  assert.equal(lightCreateLayout.surface, lightCreateLayout.tokenSurface, 'create modal surface follows the light Studio token');
  assert.equal(lightCreateLayout.contentOverflowY, 'auto', 'modal form content scrolls inside the viewport when needed');
  await page.screenshot({ path: '/tmp/xmt-production-create-modal-light-320.png' });
  await page.keyboard.press('Escape');
  await lightCreateDialog.waitFor({ state: 'detached' });
  await page.locator('tbody tr').filter({ hasText: originalProduction.topic_title }).scrollIntoViewIfNeeded();
  const productionTable = page.getByRole('table');
  const narrowTableMetrics = await productionTable.evaluate((table) => {
    const scrollport = table.parentElement;
    const actionCell = table.querySelector('tbody tr td:last-child');
    const editButton = actionCell?.querySelector('button[aria-label^="编辑创作记录"]');
    const rect = editButton?.getBoundingClientRect();
    return {
      scrollWidth: scrollport?.scrollWidth ?? 0,
      clientWidth: scrollport?.clientWidth ?? 0,
      actionPosition: actionCell ? getComputedStyle(actionCell).position : '',
      actionLeft: rect?.left ?? -1,
      actionRight: rect?.right ?? -1,
      actions: Array.from(actionCell?.querySelectorAll('button[aria-label]') ?? [], (action) => {
        const actionRect = action.getBoundingClientRect();
        return { label: action.getAttribute('aria-label') || '', left: actionRect.left, right: actionRect.right, top: actionRect.top, bottom: actionRect.bottom, width: actionRect.width, height: actionRect.height };
      }),
    };
  });
  assert.ok(narrowTableMetrics.scrollWidth > narrowTableMetrics.clientWidth, 'production table retains its horizontal scroll affordance on narrow screens');
  assert.equal(narrowTableMetrics.actionPosition, 'sticky', 'production row actions stay fixed while other columns scroll');
  assert.ok(narrowTableMetrics.actionLeft >= 0 && narrowTableMetrics.actionRight <= 320, `edit action stays reachable inside the 320px viewport: ${JSON.stringify(narrowTableMetrics)}`);
  assert.equal(narrowTableMetrics.actions.length, 2, 'the narrow production row retains both permitted actions');
  for (const action of narrowTableMetrics.actions) {
    assert.ok(action.width >= 40 && action.height >= 40, `${action.label} has a 40px mobile target: ${JSON.stringify(action)}`);
    assert.ok(action.left >= 0 && action.right <= 320 && action.top >= 0 && action.bottom <= 568,
      `${action.label} remains fully visible when its row is in view: ${JSON.stringify(action)}`);
  }
  await page.screenshot({ path: '/tmp/xmt-production-list-actions-light-320.png' });
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.getByRole('button', { name: '添加创作' }).click();
  await page.locator('select').first().selectOption(String(topics[0].id));
  await page.getByPlaceholder('如：v1.0').fill('v1.1');
  await page.getByPlaceholder('请输入创作内容描述').fill('通过隔离浏览器验证的新增稿件。');
  await page.route('**/api/workflow/production**', holdProductionListRoute);
  nextCreatePostGate = new Promise<void>((resolve) => { releaseCreatePost = resolve; });
  const createReadStart = heldProductionReads.length;
  const createRequestStarted = page.waitForRequest((request) => request.url().endsWith('/api/workflow/production') && request.method() === 'POST', { timeout: 60000 });
  const createButton = page.getByRole('button', { name: '保存', exact: true });
  await createButton.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await page.getByRole('alert').filter({ hasText: '创建结果正在核实' }).waitFor();
  assert.equal(await page.getByRole('dialog', { name: '添加创作记录' }).count(), 0, 'the form closes as the durable recovery banner takes over');
  assert.equal(await page.getByRole('button', { name: '添加创作' }).isDisabled(), true, 'other create writes stay locked while the original request is pending');
  await createRequestStarted;
  const createRequest = page.waitForResponse((response) => response.url().endsWith('/api/workflow/production') && response.request().method() === 'POST', { timeout: 15000 });
  releaseCreatePost();
  await waitForHeldProductionReads(createReadStart + 1);
  assert.equal(heldProductionReads[createReadStart].page, 1, 'the create broadcast refresh reads the first page');
  const confirmedCreatedProduction = { ...originalProduction, id: 963, version: 'v1.1', content: '通过隔离浏览器验证的新增稿件。' };
  await heldProductionReads[createReadStart].respond(200, [confirmedCreatedProduction, originalProduction], 2);
  await page.getByText('共 2 条', { exact: false }).waitFor();
  const createResponse = await createRequest;
  assert.equal(createResponse.status(), 201, `isolated create returns 201 after its delayed request; received ${createResponse.status()}`);
  await waitForHeldProductionReads(createReadStart + 2);
  assert.equal(heldProductionReads[createReadStart + 1].page, 1, 'the post-confirmation refresh remains on page one');
  await page.getByText('共 2 条', { exact: false }).waitFor();
  assert.equal(await page.getByText('共 3 条', { exact: false }).count(), 0, 'a successful socket refresh is not counted twice when the POST response arrives');
  await heldProductionReads[createReadStart + 1].respond(503);
  await page.getByText('创建成功', { exact: true }).waitFor();
  await page.getByText('服务端已确认创作记录「创作列表反馈验收选题」已创建，但列表刷新失败；请重新加载列表确认，不要重复提交。', { exact: true }).waitFor();
  assert.equal(createWrites, 1, 'the server confirms one create before the list refresh fails');
  assert.equal(await page.getByText('创建成功', { exact: true }).count(), 1, 'double click produces one success notification');
  assert.equal(await page.getByRole('heading', { name: '添加创作记录', exact: true }).count(), 0, 'confirmed create closes the editor to prevent repeating the mutation');
  assert.equal(await page.getByText('创建失败', { exact: true }).count(), 0, 'a failed follow-up read is not reported as a failed create');
  await page.screenshot({ path: '/tmp/xmt-production-list-create-refresh-failure.png' });
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await waitForHeldProductionReads(createReadStart + 3);
  assert.equal(heldProductionReads[createReadStart + 2].page, 1, 'read-only recovery retries the first page');
  await heldProductionReads[createReadStart + 2].respond(200, [confirmedCreatedProduction, originalProduction], 2);
  await page.getByText(topics[0].title, { exact: true }).first().waitFor();
  assert.equal(createWrites, 1, 'list retry does not repeat the confirmed create');
  await page.unroute('**/api/workflow/production**', holdProductionListRoute);

  await page.goto(`${base}/__qa-production?theme=dark`);
  await page.getByRole('heading', { name: '创作管理' }).waitFor();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  const originalEditButton = page.getByTitle('编辑记录').nth(1);
  await originalEditButton.click();
  const darkEditDialog = page.getByRole('dialog', { name: '编辑创作记录' });
  await darkEditDialog.waitFor();
  assert.equal(await darkEditDialog.getAttribute('aria-modal'), 'true', 'edit modal exposes dialog semantics');
  const darkEditLayout = await page.locator('.xmt-overlay > div').first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const probe = document.createElement('span');
    element.append(probe);
    probe.style.backgroundColor = 'var(--xmt-surface)';
    const tokenSurface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, surface: getComputedStyle(element).backgroundColor, tokenSurface };
  });
  assert.ok(darkEditLayout.left >= 0 && darkEditLayout.right <= 390 && darkEditLayout.top >= 0 && darkEditLayout.bottom <= 844, `dark edit modal stays within the 390x844 viewport: ${JSON.stringify(darkEditLayout)}`);
  assert.equal(darkEditLayout.surface, darkEditLayout.tokenSurface, 'edit modal surface follows the dark Studio token');
  await page.screenshot({ path: '/tmp/xmt-production-edit-modal-dark-390.png' });
  await page.getByPlaceholder('如：v1.0').fill('v2.0');
  await page.getByPlaceholder('请输入创作内容描述').fill('通过隔离浏览器验证的已保存修订。');
  const updateRequest = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`) && response.request().method() === 'PUT' && response.status() === 200);
  const updateRefreshFailures = Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/workflow/production?') && response.request().method() === 'GET' && response.status() === 503),
    page.waitForResponse((response) => response.url().includes('/api/workflow/production?') && response.request().method() === 'GET' && response.status() === 503),
  ]);
  const updateReadStart = heldProductionReads.length;
  await page.route('**/api/workflow/production**', holdProductionListRoute);
  const updateButton = page.getByRole('button', { name: '更新', exact: true });
  await updateButton.click();
  await updateRequest;
  await page.getByText('更新成功', { exact: true }).waitFor();
  await waitForHeldProductionReads(updateReadStart + 2);
  await emitProductionCreated();
  await waitForHeldProductionReads(updateReadStart + 3);
  await heldProductionReads[updateReadStart + 2].respond(503);
  await page.getByText('服务端已确认创作记录「创作列表反馈验收选题」（v2.0）已保存，但列表刷新失败；请重新加载列表确认，不要重复提交。', { exact: true }).waitFor();
  await heldProductionReads[updateReadStart].respond(200, productions, productionTotalOverride ?? productions.length);
  await heldProductionReads[updateReadStart + 1].respond(503);
  await updateRefreshFailures;
  await page.getByText('服务端已确认创作记录「创作列表反馈验收选题」（v2.0）已保存，但列表刷新失败；请重新加载列表确认，不要重复提交。', { exact: true }).waitFor();
  assert.equal(updateWrites, 1, 'the server confirms one update before the list refresh fails');
  assert.equal(await page.getByText('更新失败', { exact: true }).count(), 0, 'a failed follow-up read is not reported as a failed update');
  assert.equal(await page.getByText('v2.0', { exact: true }).count(), 1, 'the locally confirmed update remains visible while refresh is unavailable');
  assert.equal(await page.getByText('创作列表未能实时更新；当前内容可能不是最新的，请重新加载列表。', { exact: true }).count(), 0, 'a socket failure cannot downgrade the confirmed-write recovery message');
  const failedRetryStart = heldProductionReads.length;
  const failedRetryResponse = page.waitForResponse((response) => response.url().includes('/api/workflow/production?') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await waitForHeldProductionReads(failedRetryStart + 1);
  await heldProductionReads[failedRetryStart].respond(503);
  await failedRetryResponse;
  await page.getByText('服务端已确认创作记录「创作列表反馈验收选题」（v2.0）已保存，但列表刷新失败；请重新加载列表确认，不要重复提交。', { exact: true }).waitFor();
  const updateRetryStart = heldProductionReads.length;
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await waitForHeldProductionReads(updateRetryStart + 1);
  await heldProductionReads[updateRetryStart].respond(200, productions, productionTotalOverride ?? productions.length);
  await page.getByText('v2.0', { exact: true }).waitFor();
  assert.equal(updateWrites, 1, 'list retry does not repeat the confirmed update');
  await page.unroute('**/api/workflow/production**', holdProductionListRoute);

  const ambiguousEditRow = page.locator('tbody tr')
    .filter({ hasText: originalProduction.topic_title })
    .filter({ hasText: 'v2.0' });
  await ambiguousEditRow.getByTitle('编辑记录').click();
  const ambiguousEditDialog = page.getByRole('dialog', { name: '编辑创作记录' });
  await ambiguousEditDialog.waitFor();
  await page.getByPlaceholder('如：v1.0').fill('v3.0');
  await page.getByPlaceholder('请输入创作内容描述').fill('已提交但响应丢失的列表编辑');
  await ambiguousEditDialog.locator('select').last().selectOption('review');
  await page.request.post(`${base}/__qa-production/commit-next-production-update-and-fail`);
  await page.request.post(`${base}/__qa-production/fail-next-production-list-read`);
  const writesBeforeCommittedUpdate = updateWrites;
  const detailReadsBeforeCommittedUpdate = productionDetailReadAttempts;
  const committedUpdateResponse = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`)
    && response.request().method() === 'PUT');
  const committedUpdateReadback = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`)
    && response.request().method() === 'GET' && response.status() === 200);
  const confirmedUpdateListFailure = page.waitForResponse((response) => response.url().includes('/api/workflow/production?')
    && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '更新', exact: true }).click();
  assert.equal((await committedUpdateResponse).status(), 503, 'the isolated server commits the list update before returning 503');
  await committedUpdateReadback;
  await page.getByText('更新结果已核实', { exact: true }).waitFor();
  await confirmedUpdateListFailure;
  await page.getByText('服务端已确认创作记录「创作列表反馈验收选题」已保存，但列表刷新失败；请重新加载列表确认，不要重复提交。', { exact: true }).waitFor();
  assert.equal(updateWrites, writesBeforeCommittedUpdate + 1, 'a committed update with a lost response is sent only once');
  assert.equal(productionDetailReadAttempts, detailReadsBeforeCommittedUpdate + 1, 'the committed update is reconciled with exactly one detail GET');
  assert.equal(await page.getByRole('dialog', { name: '编辑创作记录' }).count(), 0, 'read-back confirmation closes the edit modal');
  assert.equal(await page.getByText('更新失败', { exact: true }).count(), 0, 'a committed update is not reported as failed when only list refresh fails');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:production-update-pending:v1:user:96')), null,
    'confirmed update clears its recovery marker');
  const confirmedUpdateListRetryResponse = page.waitForResponse((response) => response.url().includes('/api/workflow/production?')
    && response.request().method() === 'GET' && response.status() === 200);
  await page.getByRole('button', { name: '重新加载列表', exact: true }).click();
  await confirmedUpdateListRetryResponse;
  await page.getByText('v3.0', { exact: true }).waitFor();
  assert.equal(updateWrites, writesBeforeCommittedUpdate + 1, 'retrying the failed list GET does not repeat the confirmed update');

  const nullOperatorResponse = await page.request.post(`${base}/__qa-production/set-production-operator-null/${originalProduction.id}`);
  assert.equal(nullOperatorResponse.status(), 200, 'the isolated fixture restores a legacy row with no operator ID');
  const nullOperatorRecordResponse = await page.request.get(`${base}/api/workflow/production/${originalProduction.id}`);
  assert.equal(nullOperatorRecordResponse.status(), 200, 'the isolated fixture can read the legacy record after clearing its operator ID');
  assert.equal((await nullOperatorRecordResponse.json() as FixtureProduction).operator_id, null,
    'the server returns the legacy null operator ID before the next update recovery');
  await page.setViewportSize({ width: 1440, height: 960 });
  const nullOperatorListRead = page.waitForResponse((response) => response.url().includes('/api/workflow/production?')
    && response.request().method() === 'GET' && response.status() === 200);
  await page.reload();
  await nullOperatorListRead;
  await page.getByText('v3.0', { exact: true }).waitFor();

  const uncertainEditRow = page.locator('tbody tr')
    .filter({ hasText: originalProduction.topic_title })
    .filter({ hasText: 'v3.0' });
  await uncertainEditRow.getByTitle('编辑记录').click();
  const uncertainEditDialog = page.getByRole('dialog', { name: '编辑创作记录' });
  await uncertainEditDialog.waitFor();
  await page.getByPlaceholder('如：v1.0').fill('v4.0');
  await page.getByPlaceholder('请输入创作内容描述').fill('未确认后等待明确重试的列表编辑');
  await page.request.post(`${base}/__qa-production/fail-next-production-update-without-commit`);
  await page.request.post(`${base}/__qa-production/fail-next-production-detail-read`);
  const writesBeforeFailedReadback = updateWrites;
  const notCommittedUpdateResponse = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`)
    && response.request().method() === 'PUT');
  const failedUpdateReadback = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`)
    && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '更新', exact: true }).click();
  assert.equal((await notCommittedUpdateResponse).status(), 503, 'the isolated server rejects the next update before commit');
  await failedUpdateReadback;
  await page.getByText('更新结果尚未确认', { exact: false }).waitFor();
  assert.equal(updateWrites, writesBeforeFailedReadback + 1, 'a failed read-back does not automatically send another PUT');
  assert.equal(await page.getByRole('button', { name: '添加创作' }).isDisabled(), true, 'create writes stay locked while update status is unknown');
  assert.equal(await page.locator('tbody tr')
    .filter({ hasText: originalProduction.topic_title })
    .filter({ hasText: 'v3.0' })
    .getByTitle('编辑记录').isDisabled(), true,
    'row editing stays locked while update status is unknown');
  const failedReadObservation = await page.getByRole('alert').innerText();
  assert.match(failedReadObservation, /写入已锁定/);
  assert.ok(await page.evaluate(() => sessionStorage.getItem('xmt:production-update-pending:v1:user:96')),
    'the ambiguous patch and original record snapshot survive a failed status read');
  await page.request.post(`${base}/__qa-production/fail-next-production-detail-read`);
  const manualUpdateReadbackFailure = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`)
    && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '只读核实更新状态' }).click();
  await manualUpdateReadbackFailure;
  assert.equal(updateWrites, writesBeforeFailedReadback + 1, 'an explicit read-only check still does not resubmit the update');
  assert.ok(await page.evaluate(() => sessionStorage.getItem('xmt:production-update-pending:v1:user:96')),
    'a second failed check keeps the recovery marker available for reload');
  const updateReadsBeforeReload = productionDetailReadAttempts;
  const updateWritesBeforeReload = updateWrites;
  await page.setViewportSize({ width: 1440, height: 960 });
  const reloadUpdateReadback = page.waitForRequest((request) => request.url().endsWith(`/api/workflow/production/${originalProduction.id}`)
    && request.method() === 'GET', { timeout: 10_000 }).catch(() => null);
  await page.reload();
  const reloadUpdateRequest = await reloadUpdateReadback;
  if (!reloadUpdateRequest) {
    const reloadState = await page.evaluate((storageKey) => {
      const savedUser = localStorage.getItem('xmt_user');
      let userId: number | null = null;
      try { userId = Number(JSON.parse(savedUser || 'null')?.id) || null; } catch { userId = null; }
      return {
        url: location.href,
        readyState: document.readyState,
        pendingMarkerPresent: sessionStorage.getItem(storageKey) !== null,
        userId,
        body: document.body.innerText.slice(0, 1000),
      };
    }, 'xmt:production-update-pending:v1:user:96');
    assert.fail(`reload recovery did not issue the expected read-only detail GET: ${JSON.stringify(reloadState)}`);
  }
  const reloadUpdateResponse = await reloadUpdateRequest.response();
  assert(reloadUpdateResponse, 'the reload recovery detail request receives a response');
  assert.equal(reloadUpdateResponse.status(), 200,
    `reload recovery GET should succeed; received ${reloadUpdateResponse.status()} from ${reloadUpdateResponse.url()} at ${page.url()}`);
  await page.getByRole('dialog', { name: '编辑创作记录' }).waitFor();
  assert.equal(productionDetailReadAttempts, updateReadsBeforeReload + 1, 'reload restores the pending update with one automatic read-only GET');
  assert.equal(updateWrites, updateWritesBeforeReload, 'reload recovery never automatically resends the update');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('xmt:production-update-pending:v1:user:96')), null,
    'a read-back confirming the original legacy row clears the recovery marker');
  await page.getByRole('dialog', { name: '编辑创作记录' }).waitFor();
  assert.equal(await page.getByPlaceholder('如：v1.0').inputValue(), 'v4.0', 'an unchanged readback restores the requested version');
  assert.equal(await page.getByPlaceholder('请输入创作内容描述').inputValue(), '未确认后等待明确重试的列表编辑', 'an unchanged readback restores the edit body');
  assert.equal(updateWrites, writesBeforeFailedReadback + 1, 'read-only verification does not resubmit the update');
  assert.equal(await page.getByRole('button', { name: '添加创作', exact: true, includeHidden: true }).isDisabled(), false,
    'writes unlock after read-back confirms the original record is unchanged');
  const explicitUpdateRetry = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`)
    && response.request().method() === 'PUT' && response.status() === 200);
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await explicitUpdateRetry;
  await page.getByText('更新成功', { exact: true }).waitFor();
  assert.equal(updateWrites, writesBeforeFailedReadback + 2, 'only the user-confirmed retry sends a second update PUT');

  const changedEditRow = page.locator('tbody tr')
    .filter({ hasText: originalProduction.topic_title })
    .filter({ hasText: 'v4.0' });
  await changedEditRow.getByTitle('编辑记录').click();
  const changedEditDialog = page.getByRole('dialog', { name: '编辑创作记录' });
  await changedEditDialog.waitFor();
  await page.getByPlaceholder('如：v1.0').fill('v5.0');
  await page.getByPlaceholder('请输入创作内容描述').fill('保留待核对的第三方变化前草稿');
  await page.request.post(`${base}/__qa-production/commit-next-production-update-and-fail`);
  await page.request.post(`${base}/__qa-production/change-next-production-detail-read`, {
    data: { operator_id: 97, status: 'rejected', content: '第三方最新正文', updated_at: '2026-10-09 11:00:00' },
  });
  const writesBeforeThirdPartyChange = updateWrites;
  const changedUpdateResponse = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`)
    && response.request().method() === 'PUT');
  const changedUpdateReadback = page.waitForResponse((response) => response.url().endsWith(`/api/workflow/production/${originalProduction.id}`)
    && response.request().method() === 'GET' && response.status() === 200);
  await page.getByRole('button', { name: '更新', exact: true }).click();
  assert.equal((await changedUpdateResponse).status(), 503, 'the third-party scenario begins with a committed update and lost response');
  await changedUpdateReadback;
  await page.getByText('服务器记录在本次保存前后发生了其他变化', { exact: false }).waitFor();
  assert.equal(updateWrites, writesBeforeThirdPartyChange + 1, 'a changed server record does not trigger a second PUT');
  assert.equal(await page.getByRole('button', { name: '添加创作' }).isDisabled(), true, 'third-party changes keep create writes locked');
  await page.getByRole('button', { name: '保留草稿并基于最新记录继续' }).click();
  await page.getByRole('dialog', { name: '编辑创作记录' }).waitFor();
  assert.equal(await page.getByPlaceholder('请输入创作内容描述').inputValue(), '保留待核对的第三方变化前草稿', 'explicit conflict resolution preserves the local draft');
  assert.equal(await page.getByPlaceholder('如：v1.0').inputValue(), 'v5.0', 'explicit conflict resolution preserves the requested version');
  assert.equal(updateWrites, writesBeforeThirdPartyChange + 1, 'choosing to preserve the draft does not itself write');
  assert.equal(await page.getByRole('button', { name: '添加创作', exact: true, includeHidden: true }).isDisabled(), false,
    'explicit resolution releases the write lock');
  await page.getByRole('button', { name: '取消', exact: true }).click();

  const fillCreateForm = async (version: string, content: string) => {
    await page.getByRole('button', { name: '添加创作', exact: false }).click();
    await page.locator('select').first().selectOption(String(topics[0].id));
    await page.getByPlaceholder('如：v1.0').fill(version);
    await page.getByPlaceholder('请输入创作内容描述').fill(content);
  };

  const committedCreateCount = createWrites;
  await fillCreateForm('v3.0', '服务端已创建但响应丢失的稿件');
  await page.route('**/api/workflow/production', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const committed = await route.fetch();
    assert.equal(committed.status(), 201, 'the isolated server commits the create before simulating a lost response');
    await route.fulfill({ response: committed, status: 503, body: JSON.stringify({ message: '隔离测试模拟创建响应丢失' }) });
  });
  const committedResponseLost = page.waitForResponse((response) => response.url().endsWith('/api/workflow/production') && response.request().method() === 'POST' && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await committedResponseLost;
  await page.getByText('创建结果已核实', { exact: true }).waitFor();
  assert.equal(createWrites, committedCreateCount + 1, 'a committed create with a lost response is recovered without a second create');
  assert.equal(await page.getByRole('alert').count(), 0, 'verified committed creation clears the uncertain-write banner');
  await page.unroute('**/api/workflow/production');

  const uncommittedCreateCount = createWrites;
  await fillCreateForm('v3.1', '未提交后等待显式安全重试的稿件');
  let failUncommittedCreateRequest = true;
  await page.route('**/api/workflow/production', async (route) => {
    if (route.request().method() === 'POST' && failUncommittedCreateRequest) {
      failUncommittedCreateRequest = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '隔离测试模拟请求未到达服务端' }) });
      return;
    }
    await route.continue();
  });
  const missingCreateRequest = page.waitForRequest((request) => request.url().endsWith('/api/workflow/production') && request.method() === 'POST');
  const uncommittedResponseLost = page.waitForResponse((response) => response.url().endsWith('/api/workflow/production') && response.request().method() === 'POST' && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const originalCreateRequest = await missingCreateRequest;
  const originalClientRequestId = String(originalCreateRequest.postDataJSON().client_request_id);
  await uncommittedResponseLost;
  await page.getByRole('button', { name: '使用原请求安全重试', exact: true }).waitFor();
  assert.equal(createWrites, uncommittedCreateCount, 'a missing read-back does not automatically repeat the create');
  const explicitRetry = page.waitForResponse((response) => response.url().endsWith('/api/workflow/production') && response.request().method() === 'POST' && response.status() === 201);
  await page.getByRole('button', { name: '使用原请求安全重试', exact: true }).click();
  await explicitRetry;
  await page.getByText('创建成功', { exact: true }).waitFor();
  assert.equal(createWrites, uncommittedCreateCount + 1, 'the explicit same-key retry creates exactly one record');
  assert.equal(productionCreateRequestIds.at(-1), originalClientRequestId, 'safe retry uses the original request identifier');
  await page.unroute('**/api/workflow/production');

  const reloadCreateCount = createWrites;
  await fillCreateForm('v3.2', '刷新后只读恢复的稿件');
  let failFirstReadBack = true;
  await page.route('**/api/workflow/production**', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (request.method() === 'POST' && requestUrl.pathname === '/api/workflow/production') {
      const committed = await route.fetch();
      await route.fulfill({ response: committed, status: 503, body: JSON.stringify({ message: '隔离测试模拟创建响应丢失' }) });
      return;
    }
    if (request.method() === 'GET' && requestUrl.pathname.includes('/create-request/') && failFirstReadBack) {
      failFirstReadBack = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '隔离测试模拟状态回查暂不可用' }) });
      return;
    }
    await route.continue();
  });
  const reloadInitialReadFailure = page.waitForResponse((response) => response.url().includes('/create-request/') && response.request().method() === 'GET' && response.status() === 503);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await reloadInitialReadFailure;
  await page.getByText('状态读取失败', { exact: false }).waitFor();
  assert.equal(createWrites, reloadCreateCount + 1, 'a committed create and failed first read do not trigger another write');
  await page.reload();
  await page.getByRole('heading', { name: '创作管理' }).waitFor();
  await page.getByText('创建结果已核实', { exact: true }).waitFor();
  assert.equal(createWrites, reloadCreateCount + 1, 'reload performs read-only recovery and does not repeat the create');
  await page.unroute('**/api/workflow/production**');

  assert.equal(expectedHttpErrors.length, 16, `only the injected list, update and create-recovery fixtures return errors: ${JSON.stringify(expectedHttpErrors)}`);
  assert.equal(expectedHttpErrors.filter((description) => description.includes('GET ') && description.includes('/api/workflow/production?')).length, 6, 'the six expected list-read failures are the injected stale/read-recovery fixtures');
  assert.equal(expectedHttpErrors.filter((description) => description.includes('GET ') && /\/api\/workflow\/production\/\d+$/.test(description.split(' ').at(-1) || '')).length, 2, 'the two expected detail-read failures are injected update-recovery fixtures');
  assert.equal(expectedHttpErrors.filter((description) => description.startsWith('PUT 503 ') && /\/api\/workflow\/production\/\d+$/.test(description.split(' ').at(-1) || '')).length, 3, 'the three expected update failures simulate ambiguous before-commit and after-commit responses');
  assert.equal(expectedHttpErrors.filter((description) => description.startsWith('POST 503 ') && description.endsWith('/api/workflow/production')).length, 3, 'the three expected create POST failures are injected lost or uncommitted responses');
  assert.equal(expectedHttpErrors.filter((description) => description.includes('/create-request/')).length, 2, 'create recovery only expects the missing-key 404 and one injected status-read 503');
  assert.deepEqual(errors, [], 'the production list and create-recovery flows render without unexpected browser errors');
  assert.deepEqual(errors, [], 'the production list flow renders without unexpected browser errors');
  await page.screenshot({ path: '/tmp/xmt-production-list-feedback-recovered.png' });
  await page.close();
  console.log('Production list feedback browser test passed: create/update success stays distinct from follow-up refresh failure; current state is retained, list retry succeeds without duplicate writes, and expected 503s produce no unexpected browser errors.');
} finally {
  await browser.close();
  await vite.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
